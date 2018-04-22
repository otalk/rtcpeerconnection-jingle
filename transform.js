const SDPUtils = require('sdp');

function toJSON(sdp) {
    const mediaSections = SDPUtils.splitSections(sdp);
    const sessionPart = mediaSections.shift();
    const description = {
        media: [],
        groups: [],
    };
    SDPUtils.matchPrefix(sessionPart, 'a=group:').forEach((groupLine) => {
        const parts = groupLine.split(' ');
        const semantics = parts.shift().substr(8);
        description.groups.push({
            semantics,
            mids: parts,
        });
    });

    mediaSections.forEach((mediaSection) => {
        const mediaJSON = mediaSectionToJSON(mediaSection, sessionPart);
        description.media.push(mediaJSON);
    });
    return description;
}

function mediaSectionToJSON(mediaSection, sessionPart) {
    const kind = SDPUtils.getKind(mediaSection);
    const isRejected = SDPUtils.isRejected(mediaSection);
    const mLine = SDPUtils.parseMLine(mediaSection);
    const m = {
        direction: SDPUtils.getDirection(mediaSection, sessionPart),
        kind,
        protocol: mLine.protocol,
        mid: SDPUtils.getMid(mediaSection),
        // TODO: what about end-of-candidates?
    };
    if (!isRejected) {
        m.iceParameters = SDPUtils.getIceParameters(mediaSection, sessionPart);
        m.dtlsParameters = SDPUtils.getDtlsParameters(mediaSection, sessionPart);
        m.setup = SDPUtils.matchPrefix(mediaSection, 'a=setup:')[0].substr(8);
    }
    if (kind === 'audio' || kind === 'video') {
        m.rtpParameters = SDPUtils.parseRtpParameters(mediaSection, sessionPart);
        m.rtpEncodingParameters = SDPUtils.parseRtpEncodingParameters(mediaSection);
        m.rtcpParameters = SDPUtils.parseRtcpParameters(mediaSection, sessionPart);
        m.stream = SDPUtils.parseMsid(mediaSection); // may be undefined.
    } else if (kind === 'application' && m.protocol === 'DTLS/SCTP') {
    }
    m.candidates = SDPUtils.matchPrefix(mediaSection, 'a=candidate:')
        .map(SDPUtils.parseCandidate);
    return m;
}

function toSDP(json) {
    let sdp = SDPUtils.writeSessionBoilerplate(json.sessionId, json.sessionVersion);
    sdp += 'a=msid-semantic:WMS *\r\n';
    if (json.groups.length) {
        sdp += json.groups.map((g) => {
            return 'a=group:' + g.semantics + ' ' + g.mids.join(' ');
        }).join('\r\n') + '\r\n';
    }
    sdp += json.media.map((m) => {
        const isRejected = !(m.iceParameters && m.dtlsParameters);
        let str = '';
        if (m.kind === 'application' && m.protocol === 'DTLS/SCTP') {
            str += 'm=application 9 DTLS/SCTP 5000\r\n' +
                'c=IN IP4 0.0.0.0\r\n' +
                'a=sctpmap:5000 webrtc-datachannel 256\r\n';
        } else {
            str += SDPUtils.writeRtpDescription(m.kind, m.rtpParameters);
            if (isRejected) {
                str = str.replace('m=' + m.kind + ' 9 ', 'm=' + m.kind + ' 0 ');
            }
            str += 'a=' + (m.direction || 'sendrecv') + '\r\n';
            if (m.stream) {
                str += 'a=msid:' + m.stream.stream + ' ' + m.stream.track + '\r\n';
            }
            if (m.rtcpParameters.cname) {
                str += 'a=ssrc:' + m.rtcpParameters.ssrc + ' cname:' + m.rtcpParameters.cname + '\r\n';
                if (m.rtpEncodingParameters[0].rtx) {
                    str += 'a=ssrc-group:FID ' + m.rtpEncodingParameters[0].ssrc + ' ' + m.rtpEncodingParameters[0].rtx.ssrc  + '\r\n' +
                        'a=ssrc:' + m.rtpEncodingParameters[0].rtx.ssrc + ' cname:' + m.rtcpParameters.cname + '\r\n';
                }
            }
        }
        return str +
            (!isRejected ? 'a=mid:' + m.mid + '\r\n' : '') +
            (m.iceParameters ? SDPUtils.writeIceParameters(m.iceParameters) : '') + 
            (m.dtlsParameters ? SDPUtils.writeDtlsParameters(m.dtlsParameters, m.setup) : '') +
            (m.candidates && m.candidates.length ? m.candidates.map(SDPUtils.writeCandidate).join('\r\n') + '\r\n' : '');
    }).join('');
    return sdp;
}

module.exports = {
    toJSON,
    toSDP,
};
