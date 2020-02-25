describe('RTP media', () => {
    function negotiate(pc1, pc2) {
        pc1.addEventListener('icecandidate', (e) => e.candidate && pc2.addIceCandidate(e.candidate ? {json: e.candidate.json, sdpMid: e.candidate.sdpMid, sdpMLineIndex: e.candidate.sdpMLineIndex} : undefined));
        pc2.addEventListener('icecandidate', (e) => e.candidate && pc1.addIceCandidate(e.candidate ? {json: e.candidate.json, sdpMid: e.candidate.sdpMid, sdpMLineIndex: e.candidate.sdpMLineIndex} : undefined));
        return pc1.createOffer()
            .then(offer => Promise.all([
                pc1.setLocalDescription(offer),
                pc2.setRemoteDescription(offer)
            ]))
           .then(() => pc2.createAnswer())
           .then(answer => Promise.all([
                pc2.setLocalDescription(answer),
                pc1.setRemoteDescription(answer)
            ]));
    }

    let pc1;
    let pc2;

    beforeEach(() => {
        pc1 = new RTCPeerConnection({sdpSemantics: 'json'});
        pc2 = new RTCPeerConnection({sdpSemantics: 'json'});
    });
    afterEach(() => {
        pc1.close();
        pc2.close();
    });

    it('signaling state goes to stable', (done) => {
        pc1.onsignalingstatechange = (e) => {
            if (pc1.signalingState === 'stable') done();
        };
        navigator.mediaDevices.getUserMedia({audio: true, video: true})
            .then(stream => pc1.addTrack(stream.getTracks()[0], stream))
            .then(() => negotiate(pc1, pc2))
            .catch(e => console.error(e))
    });

    it('iceconnectionstate goes to connected/completed', (done) => {
        pc1.oniceconnectionstatechange = (e) => {
            if (pc1.iceConnectionState === 'connected' || pc1.iceConnectionState === 'completed') {
                done();
            }
        };
        navigator.mediaDevices.getUserMedia({audio: true, video: true})
            .then(stream => pc1.addTrack(stream.getTracks()[0], stream))
            .then(() => negotiate(pc1, pc2))
            .catch(e => console.error(e));
    });

    it('signals stream information', (done) => {
        pc2.ontrack = (e) => {
            done();
        };
        navigator.mediaDevices.getUserMedia({audio: true, video: true})
            .then(stream => pc1.addTrack(stream.getTracks()[0], stream))
            .then(() => negotiate(pc1, pc2))
            .catch(e => console.error(e))
    });
});
