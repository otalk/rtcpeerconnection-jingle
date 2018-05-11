const SDPUtils = require('sdp');
const {wrapPeerConnectionEvent} = require('webrtc-adapter/src/js/utils');

const transform = require('./transform');

// TODO: RTCЅessionDescription is readonly in theory...
const origRTCPeerConnection = window.RTCPeerConnection;
window.RTCPeerConnection = function(pcConfig, pcConstraints) {
    let isJingle = false;
    if (pcConfig && pcConfig.sdpSemantics === 'json') {
        isJingle = true;
        delete pcConfig.sdpSemantics;
    }
    const pc = new origRTCPeerConnection(pcConfig, pcConstraints);
    if (isJingle) {
        pc._sdpSemantics = 'json';
    }
    return pc;
}
window.RTCPeerConnection.prototype = origRTCPeerConnection.prototype;

const origCreateOffer = RTCPeerConnection.prototype.createOffer;
window.RTCPeerConnection.prototype.createOffer = function(opts) {
    const pc = this;
    return origCreateOffer.apply(pc, [opts])
        .then((offer) => {
            if (pc._sdpSemantics === 'json') {
                return {
                    type: offer.type,
                    sdp: offer.sdp,
                    json: transform.toJSON(offer.sdp)
                };
            }
            return offer;
        });
};

const origCreateAnswer = RTCPeerConnection.prototype.createAnswer;
window.RTCPeerConnection.prototype.createAnswer = function() {
    const pc = this;
    return origCreateAnswer.apply(pc, [])
        .then((answer) => {
            if (pc._sdpSemantics === 'json') {
                return {
                    type: answer.type,
                    sdp: answer.sdp,
                    json: transform.toJSON(answer.sdp)
                };
            }
            return answer;
        });
};

/* we do not support .json in SLD as SDP munging will go away.
const origSetLocalDescription = RTCPeerConnection.prototype.setLocalDescription;
window.RTCPeerConnection.prototype.setLocalDescription = function(desc) {
    const pc = this;
    if (pc._sdpSemantics === 'json' && desc.json) {
        desc.sdp = transform.toSDP(desc.json);
    }
    return origSetLocalDescription.apply(pc, arguments);
};
*/

const origSetRemoteDescription = RTCPeerConnection.prototype.setRemoteDescription;
window.RTCPeerConnection.prototype.setRemoteDescription = function(desc) {
    const pc = this;
    if (pc._sdpSemantics === 'json' && desc.json) {
        desc.sdp = transform.toSDP(desc.json);
    }
    return origSetRemoteDescription.apply(pc, arguments);
};

const origAddIceCandidate = RTCPeerConnection.prototype.addIceCandidate;
window.RTCPeerConnection.prototype.addIceCandidate = function(candidate) {
    const pc = this;
    if (candidate) {
        if (candidate.json) {
            candidate.candidate = SDPUtils.writeCandidate(candidate.json);
        }
        // workaround: https://bugzilla.mozilla.org/show_bug.cgi?id=1456417
        if (!candidate.sdpMLineIndex && pc.remoteDescription) {
            const remoteSDP = pc.remoteDescription.sdp;
            const mediaSections = SDPUtils.getMediaSections(remoteSDP);
            for (let i = 0; i < mediaSections.length; i++) {
                if (SDPUtils.getMid(mediaSections[i]) === candidate.sdpMid) {
                    candidate.sdpMLineIndex = i;
                    break;
                }
            }
        }
    }
    return origAddIceCandidate.apply(pc, arguments);
};

wrapPeerConnectionEvent(window, 'icecandidate', (e) => {
    // TODO: what about the theoretical e.candidate.candidate === ""?
    if (e.candidate) {
        e.candidate.json = SDPUtils.parseCandidate(e.candidate.candidate);
    }
    return e;
});

['localDescription', 'remoteDescription'].forEach((property) => {
    const origGetter = Object.getOwnPropertyDescriptor(RTCPeerConnection.prototype, property).get
    Object.defineProperty(RTCPeerConnection.prototype, property, {
        get: function() {
            const desc = origGetter.apply(this);
            if (this._sdpSemantics === 'json' && desc.sdp !== '') {
                return {
                    type: desc.type,
                    sdp: desc.sdp,
                    json: transform.toJSON(desc.sdp)
                };
            }
            return desc;
        }
    });
});
