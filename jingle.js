/* mapping between the JSON format of ./rtcpeerconnection.js and the JXT format of stanza.io */
const directionToSenders = {
    initiator: {
        sendrecv: 'both',
        recvonly: 'responder',
        sendonly: 'initiator',
        inactive: 'none',
    },
    responder: {
        sendrecv: 'both',
        recvonly: 'initiator',
        sendonly: 'responder',
        inactive: 'none',
    },
};

const sendersToDirection = {
    initiator: {
        both: 'sendrecv',
        initiator: 'recvonly',
        responder: 'sendonly',
        none: 'inactive',
    },
    responder: {
        both: 'sendrecv',
        initiator: 'sendonly',
        responder: 'recvonly',
        none: 'inactive',
    },
};

function rtp2jingle(media, role) {
    return {
        applicationType: 'rtp',
        media: media.kind,
        headerExtensions: media.rtpParameters.headerExtensions.map((ext) => {
            return {
                id: ext.id,
                uri: ext.uri,
                senders: ext.direction && ext.direction !== 'sendrecv' ? directionToSenders[role][ext.direction] : undefined,
            }
        }),
        mux: media.rtcpParameters.mux,
        reducedSize: media.rtcpParameters.reducedSize, // TODO: define mapping to jingle
        ssrc: media.rtpEncodingParameters.length ? media.rtpEncodingParameters[0].ssrc : undefined,
        sources: [{
            ssrc: media.rtcpParameters.ssrc,
            parameters: [{
                key: 'cname',
                value: media.rtcpParameters.cname,
            }],
        }],
        sourceGroups: media.rtpEncodingParameters.length && media.rtpEncodingParameters[0].rtx ? [{
            semantics: 'FID',
            sources: [media.rtpEncodingParameters[0].ssrc, media.rtpEncodingParameters[0].rtx.ssrc],
        }]: undefined,
        payloads: media.rtpParameters.codecs.map((codec) => {
            return {
                id: codec.payloadType.toString(),
                name: codec.name,
                clockrate: codec.clockRate,
                channels: codec.numChannels,
                feedback: codec.rtcpFeedback.map((feedback) => {
                    return {
                        type: feedback.type,
                        subtype: feedback.parameter,
                    };
                }),
                parameters: Object.keys(codec.parameters).map((key) => {
                    return {
                        key,
                        value: codec.parameters[key]
                    };
                }),
            }
        }),
        stream: media.stream, // TODO: define jingle mapping for msid
    };
}

function transport2jingle(media) {
    return {
        transportType: 'iceUdp',
        candidates: media.candidates, // FIXME: map to jingle (no-op?)
        fingerprints: media.dtlsParameters ? media.dtlsParameters.fingerprints.map((fp) => {
            fp.setup = media.setup;
            fp.hash = fp.algorithm;
            return fp;
        }) : undefined,
        ufrag: media.iceParameters ? media.iceParameters.usernameFragment : undefined,
        pwd: media.iceParameters ? media.iceParameters.password : undefined,
        sctp: media.sctp ? [
            media.sctp,
        ] : undefined,
    };
}

function json2jingle(json, role) {
    return {
        sessionId: 'some-sid',
        sessionVersion: 123,
        groups: json.groups ? json.groups.map((group) => {
            group.contents = group.mids;
            return group;
        }) : undefined, 
        contents: json.media.map((media) => {
            const isRTP = media.kind === 'audio' || media.kind === 'video';
            return {
                creator: 'to be done by generic session',
                senders: directionToSenders[role][media.direction],
                name: media.mid,
                application: isRTP ? rtp2jingle(media, role) : { applicationType: 'datachannel', protocol: media.protocol },
                transport: transport2jingle(media),
            };
        }),
    };
}

function jingle2json(jingle, role) {
    return {
        groups: jingle.groups ? jingle.groups.map((group) => {
            group.mids = group.contents;
            return group;
        }) : undefined,
        media: jingle.contents.map((content) => {
            const isDataChannel = content.application && content.application.applicationType === 'datachannel';
            return {
                mid: content.name,
                kind: content.application.media || 'application',
                protocol: isDataChannel ? 'DTLS/SCTP' : undefined, 
                iceParameters: content.transport && content.transport.ufrag ? {
                    usernameFragment: content.transport.ufrag,
                    password: content.transport.pwd,
                } : undefined,
                dtlsParameters: content.transport && content.transport.fingerprints ? {
                    fingerprints: content.transport.fingerprints.map((fp) => {
                        fp.algorithm = fp.hash;
                        return fp;
                    })
                } : undefined,
                setup: content.transport && content.transport.fingerprints ? content.transport.fingerprints[0].setup : undefined,

                mux: content.mux,
                reducedSize: content.reducedSize,
                direction: sendersToDirection[role][content.senders],
                stream: content.application.stream,
                rtpParameters: content.application.applicationType === 'rtp' ? {
                    codecs: content.application.payloads.map((payload) => {
                        return {
                            payloadType: payload.id,
                            name: payload.name,
                            clockRate: payload.clockrate,
                            numChannels: payload.channels,
                            rtcpFeedback: payload.feedback ? payload.feedback.map((rtcpFeedback) => {
                                return {
                                    type: rtcpFeedback.type,
                                    parameter: rtcpFeedback.subtype,
                                };
                            }) : undefined,
                            parameters: payload.parameters ? payload.parameters.reduce((currentSet, keyval) => {
                                currentSet[keyval.key] = keyval.value;
                                return currentSet;
                            }, {}) : undefined,
                        };
                    }),
                    headerExtensions: content.application.headerExtensions.map((ext) => {
                        return {
                            id: ext.id,
                            uri: ext.uri,
                            direction: ext.senders && ext.senders !== 'both' ? sendersToDirection[role][content.senders] : undefined,
                        };
                    }),
                } : undefined,
                rtcpParameters: content.application.applicationType === 'rtp' ? {
                    ssrc: content.application.sources[0].ssrc,
                    cname: content.application.sources[0].parameters.find((p) => p.key === 'cname').value,
                } : undefined,
                rtpEncodingParameters: content.application.applicationType === 'rtp' ? [{
                    ssrc: content.application.ssrc,
                    rtx: content.application.sourceGroups ? {ssrc: content.application.sourceGroups[0].sources[1]} : undefined, // TODO: actually look for a FID one with matching ssrc
                }] : undefined,
                sctp: isDataChannel ? content.transport.sctp[0] : undefined,
            };
        }),
    };
}

function candidate2jingle(candidate) {
    return {
        contents: [{
            name: candidate.sdpMid,
            transport: {
                transportType: 'iceUdp',
                ufrag: candidate.json.usernameFragment || undefined,
                candidates: [
                    candidate.json,
                ],
            },
        }]
    };
}

module.exports = {
    rtp2jingle,
	transport2jingle,
	json2jingle,
	jingle2json,
	candidate2jingle,
};
