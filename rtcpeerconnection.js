const SDPUtils = require('sdp');
const {wrapPeerConnectionEvent} = require('webrtc-adapter/src/js/utils');

const transform = require('./transform');

// TODO: RTCЅessionDescription is readonly in theory...
const origRTCPeerConnection = window.RTCPeerConnection;
window.RTCPeerConnection = function(pcConfig, pcConstraints) {
    const pc = new origRTCPeerConnection(pcConfig, pcConstraints);
    if (pcConfig && pcConfig.sdpSemantics) {
        pc._sdpSemantics = pcConfig.sdpSemantics;
        delete pcConfig.sdpSemantics;
    }
    return pc;
}
window.RTCPeerConnection.prototype = origRTCPeerConnection.prototype;

const origCreateOffer = RTCPeerConnection.prototype.createOffer;
window.RTCPeerConnection.prototype.createOffer = function(opts) {
    const pc = this;
    return origCreateOffer.apply(pc, [opts])
        .then(function(offer) {
            if (pc._sdpSemantics === 'jingle') {
                offer.jingle = transform.toJSON(offer.sdp);
            }
            return offer;
        });
};

const origCreateAnswer = RTCPeerConnection.prototype.createAnswer;
window.RTCPeerConnection.prototype.createAnswer = function() {
    const pc = this;
    return origCreateAnswer.apply(pc, [])
        .then(function(answer) {
            if (pc._sdpSemantics === 'jingle') {
                answer.jingle = transform.toJSON(answer.sdp);
            }
            return answer;
        });
};

/* we do not support .jingle in SLD as SDP munging will go away.
var origSetLocalDescription = RTCPeerConnection.prototype.setLocalDescription;
window.RTCPeerConnection.prototype.setLocalDescription = function(desc) {
    const pc = this;
    if (pc._sdpSemantics === 'jingle' && desc.jingle) {
        desc.sdp = transform.toSDP(desc.jingle);
    }
    return origSetLocalDescription.apply(pc, arguments);
};
*/

const origSetRemoteDescription = RTCPeerConnection.prototype.setRemoteDescription;
window.RTCPeerConnection.prototype.setRemoteDescription = function(desc) {
    const pc = this;
    if (pc._sdpSemantics === 'jingle' && desc.jingle) {
        desc.sdp = transform.toSDP(desc.jingle);
    }
    return origSetRemoteDescription.apply(pc, arguments);
};

const origAddIceCandidate = RTCPeerConnection.prototype.addIceCandidate;
window.RTCPeerConnection.prototype.addIceCandidate = function(candidate) {
    const pc = this;
    if (candidate.jingle) {
        candidate.candidate = SDPUtils.writeCandidate(candidate.jingle);
    }
    return origAddIceCandidate.apply(pc, arguments);
};

wrapPeerConnectionEvent(window, 'icecandidate', (e) => {
    // TODO: what about the theoretical e.candidate.candidate === ""?
    if (e.candidate) {
        e.candidate.jingle = SDPUtils.parseCandidate(e.candidate.candidate);
    }
    return e;
});
