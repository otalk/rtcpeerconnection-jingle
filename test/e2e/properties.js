describe('properties', () => {
    let pc;

    beforeEach(() => {
        pc = new RTCPeerConnection({sdpSemantics: 'json'});
    });
    afterEach(() => {
        pc.close();
    });

    it('shims pc.localDescription.json', () => {
        return pc.createOffer({offerToReceiveAudio: true})
        .then(offer => pc.setLocalDescription(offer))
        .then(() => expect(pc.localDescription.json).to.be.an('Object'))
    });
    it('shims pc.remoteDescription.json', () => {
        return pc.createOffer({offerToReceiveAudio: true})
        .then(offer => pc.setRemoteDescription(offer))
        .then(() => expect(pc.remoteDescription.json).to.be.an('Object'))
    });
});
