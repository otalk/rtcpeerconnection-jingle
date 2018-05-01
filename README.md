# RTCPeerConnection & Jingle

This module extends the RTCPeerConnection API to emit and process data in a JSON
format instead of SDP.

To use it, create your RTCPeerConnection with
```
const pc = new RTCPeerConnection({sdpSemantics: 'json'});
```

The `createOffer` and `createAnswer` methods will add a JSON field to the
RTCSessionDescription while the `setRemoteDescription method processes
this field and transforms it to SDP.

The transformation is done using the [sdp](https://github.com/otalk/sdp) module and reensembles
the data structures used by the [ORTC-WebRTC shim](https://github.com/otalk/rtcpeerconnection-shim).

This format can easily be transformed to the Jingle format used by [jxt](https://github.com/otalk/jxt),
allowing the use of Jingle for signaling.
