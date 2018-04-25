const J = require('../../jingle');

const testcases = [
    {localMedia: {audio: true}, offerOptions: {}},
    {localMedia: {audio: true}, offerOptions: {offerToReceiveAudio: false}},
    {localMedia: {audio: true}, offerOptions: {offerToReceiveVideo: true}},
    {localMedia: {audio: true}, offerOptions: {offerToReceiveAudio: false, offerToReceiveVideo: true}},
    {localMedia: {video: true}, offerOptions: {}},
    {localMedia: {video: true}, offerOptions: {offerToReceiveVideo: false}},
    {localMedia: {video: true}, offerOptions: {offerToReceiveAudio: true}},
    {localMedia: {video: true}, offerOptions: {offerToReceiveAudio: true, offerToReceiveVideo: true}},
    {localMedia: {audio: true, video: true}, offerOptions: {}},
    {localMedia: {audio: true, video: true}, offerOptions: {offerToReceiveAudio: false}},
    {localMedia: {audio: true, video: true}, offerOptions: {offerToReceiveVideo: false}},
    {localMedia: {audio: true, video: true}, offerOptions: {offerToReceiveAudio: false, offerToReceiveVideo: false}},
    // with remote media
    {localMedia: {audio: true}, remoteMedia: {audio: true}, offerOptions: {}},
    {localMedia: {video: true}, remoteMedia: {video: true}, offerOptions: {}},
    {localMedia: {audio: true, video: true}, remoteMedia: {audio: true}, offerOptions: {}},
    {localMedia: {audio: true, video: true}, remoteMedia: {audio: true, video: true}, offerOptions: {}},
    // no local media, remote media. No local media, no remote media will not actually establish a connection in many cases.
    {localMedia: false, remoteMedia: {audio: true, video: true}, offerOptions: {offerToReceiveAudio: true, offerToReceiveVideo: true}},
    {localMedia: false, remoteMedia: {audio: true}, offerOptions: {offerToReceiveAudio : true}},
    {localMedia: false, remoteMedia: {video: true}, offerOptions: {offerToReceiveVideo: true}},
];

describe('session establishment with JXT mapping', () => {
    let pc;
    let pc2;
    beforeEach(() => {
        pc = new RTCPeerConnection({sdpSemantics: 'jingle'});
        pc2 = new RTCPeerConnection({sdpSemantics: 'jingle'});
        pc.onicecandidate = (e) => {
            if (!e.candidate) {
                // TODO: handle end of candidate.
                return;
            }
            const jingle = J.candidate2jingle(e.candidate);
            pc2.addIceCandidate({sdpMid: jingle.contents[0].name, jingle: jingle.contents[0].transport.candidates[0]})
                .catch(e => console.error('ADDICECANDIDATE', e.name));
        };
        pc2.onicecandidate = (e) => {
            if (!e.candidate) {
                // TODO: handle end of candidate.
                return;
            }
            const jingle = J.candidate2jingle(e.candidate);
            pc.addIceCandidate({sdpMid: jingle.contents[0].name, jingle: jingle.contents[0].transport.candidates[0]})
                .catch(e => console.error('ADDICECANDIDATE', e.name));
        };
    });
    afterEach(() => {
        pc.close();
        pc2.close();
    });

    describe('media session', () => {
        testcases.forEach((testcase) => {
            it(JSON.stringify(testcase) + ' gets established', (done) => {
                pc.addEventListener('iceconnectionstatechange', () => {
                    if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
                        done();
                    }
                });

                let p = Promise.resolve();
                if (testcase.localMedia) {
                    p = p.then(() => navigator.mediaDevices.getUserMedia(testcase.localMedia))
                        .then(stream => stream.getTracks().forEach(track => pc.addTrack(track, stream)))
                }
                p
                .then(() => pc.createOffer(testcase.offerOptions))
                .then((offer) => {
                    const jingle = J.json2jingle(offer.jingle, 'initiator');
                    const json = J.jingle2json(jingle, 'responder');
                    return pc2.setRemoteDescription({type: 'offer', jingle: json})
                        .then(() => pc.setLocalDescription(offer))
                })
                .then(() => {
                    if (testcase.remoteMedia) {
                        return navigator.mediaDevices.getUserMedia(testcase.remoteMedia)
                            .then(stream => stream.getTracks().forEach(track => pc2.addTrack(track, stream)))
                    }
                })
                .then(() => {
                    return pc2.createAnswer();
                })
                .then((answer) => {
                    const jingle = J.json2jingle(answer.jingle, 'responder');
                    const json = J.jingle2json(jingle, 'initiator');
                    return pc.setRemoteDescription({type: 'answer', jingle: json})
                        .then(() => pc2.setLocalDescription(answer))
                })
                .then(() => {
                    expect(pc.signalingState).to.equal('stable');
                    expect(pc2.signalingState).to.equal('stable');
                })
                .catch((e) => console.error(e.toString()));
            });
        });
    });

    describe('datachannel session', () => {
        it('gets established', (done) => {
            pc.addEventListener('iceconnectionstatechange', () => {
                if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
                    done();
                }
            });
            pc.createDataChannel('test');
            pc.createOffer()
            .then((offer) => {
                const jingle = J.json2jingle(offer.jingle, 'initiator');
                const json = J.jingle2json(jingle, 'responder');
                return pc2.setRemoteDescription({type: 'offer', jingle: json})
                    .then(() => pc.setLocalDescription(offer))
            })
            .then(() => {
                return pc2.createAnswer();
            })
            .then((answer) => {
                const jingle = J.json2jingle(answer.jingle, 'responder');
                const json = J.jingle2json(jingle, 'initiator');
                return pc.setRemoteDescription({type: 'answer', jingle: json})
                    .then(() => pc2.setLocalDescription(answer))
            })
            .then(() => {
                expect(pc.signalingState).to.equal('stable');
                expect(pc2.signalingState).to.equal('stable');
            })
            .catch((e) => console.error(e.toString()));
        });
    });
});
