# Anti-Peep gaze model assessment

## Summary

Best fit for the existing React browser application: [`@vladmandic/human`](https://github.com/vladmandic/human). It combines multiple-face detection, face embeddings, iris/gaze gestures, head rotation, temporal smoothing, liveness, and anti-spoofing. Its FaceID demo already validates face count, size, face/gaze direction, confidence, blinking, liveness, and descriptor matching.

The current implementation locks immediately when more than one face is detected and explicitly skips head-pose analysis. The intended behavior needs a per-face state machine: identify the owner, track every non-owner, start a monotonic timer only while the same non-owner is facing/looking toward the screen-camera region, and lock after 3,000 ms. Use a 300-500 ms missed-frame grace period.

## Alternatives

- MediaPipe Face Landmarker for Web: official multi-face tracking, 478 landmarks, iris points, and facial transform matrices. Requires custom attention classification and identity matching.
- OpenVINO gaze-estimation-adas-0002: proper 3D gaze vector, but better suited to native/server inference than a Vite browser app.

## Recommendation

Migrate the anti-peep perception loop from `@vladmandic/face-api` to `@vladmandic/human`, retain multiple owner embeddings, and add a per-intruder dwell tracker. Calibrate an attention cone for the laptop webcam because exact screen-point gaze cannot be inferred reliably without user/device calibration.

## References

- [Human repository](https://github.com/vladmandic/human)
- [Human FaceID demo](https://github.com/vladmandic/human/tree/main/demo/faceid)
- [MediaPipe Face Landmarker Web guide](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js)
- [OpenVINO gaze model](https://github.com/openvinotoolkit/open_model_zoo/tree/master/models/intel/gaze-estimation-adas-0002)
