import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../../stores/useAuthStore';
import { toast } from 'sonner';
import axios from '../../lib/axios';
import FaceIDCalibrationModal from './FaceIDCalibrationModal';
import AntiPeepLockOverlay from './AntiPeepLockOverlay';
import { updateIntruderTracks } from './antiPeepTracker';
import {
    analysisConfig,
    bestOwnerSimilarity,
    FACE_MODEL_VERSION,
    getFaceGestures,
    getHuman,
    isAttentiveFace,
    loadAnalysisModels,
    loadDetector,
    OWNER_MATCH_THRESHOLD,
    scanConfig,
} from './antiPeepVision';
const AntiPeepContext = createContext();

const SCAN_DELAY_MS = 1500;
const ANALYSIS_DELAY_MS = 350;
const CALIBRATION_DELAY_MS = 180;
const ENROLLMENT_SAMPLE_COUNT = 5;

const cameraConstraints = {
    audio: false,
    video: {
        facingMode: 'user',
        width: { ideal: 320, max: 640 },
        height: { ideal: 240, max: 480 },
        frameRate: { ideal: 6, max: 10 },
    },
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAntiPeep = () => useContext(AntiPeepContext);

const hasCurrentEnrollment = (antiPeepData) => (
    antiPeepData?.modelVersion === FACE_MODEL_VERSION
    && Array.isArray(antiPeepData?.faceDescriptors)
    && antiPeepData.faceDescriptors.length > 0
);

export const AntiPeepProvider = ({ children }) => {
    const { user, updateUser } = useAuthStore();
    const [modelStatus, setModelStatus] = useState('idle');
    const [modelError, setModelError] = useState('');
    const [cameraStatus, setCameraStatus] = useState('idle');
    const [isProtecting, setIsProtecting] = useState(false);
    const [isLocked, setIsLocked] = useState(false);
    const [lockReason, setLockReason] = useState('');

    const [calibrationStep, setCalibrationStep] = useState('idle');
    const [tempDescriptors, setTempDescriptors] = useState([]);
    const [guidanceText, setGuidanceText] = useState('Đang khởi động camera...');
    const [isAligned, setIsAligned] = useState(false);
    const [alignmentStatus, setAlignmentStatus] = useState('loading');
    const [captureProgress, setCaptureProgress] = useState(0);
    const [landmarksData, setLandmarksData] = useState(null);
    const [isUnlocking, setIsUnlocking] = useState(false);
    const [tempPin, setTempPin] = useState('');

    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const cameraGenerationRef = useRef(0);
    const cameraOpenPromiseRef = useRef(null);
    const protectionTimerRef = useRef(null);
    const calibrationTimerRef = useRef(null);
    const protectionGenerationRef = useRef(0);
    const calibrationGenerationRef = useRef(0);
    const startAttemptRef = useRef(0);
    const startPromiseRef = useRef(null);
    const detectionChainRef = useRef(Promise.resolve());
    const detectorLoadPromiseRef = useRef(null);
    const analysisLoadPromiseRef = useRef(null);
    const trackerRef = useRef({ tracks: [], nextId: 1 });
    const latestUser = useRef(user);
    const protectionActiveRef = useRef(false);
    const calibrationStepRef = useRef('idle');
    const lockedRef = useRef(false);
    const previousUserIdRef = useRef(user?._id || null);
    const autoSamplesRef = useRef([]);
    const lastSampleTimeRef = useRef(0);

    useEffect(() => {
        latestUser.current = user;
    }, [user]);

    useEffect(() => {
        const currentUserId = user?._id || null;
        const userChanged = (
            previousUserIdRef.current
            && previousUserIdRef.current !== currentUserId
        );
        previousUserIdRef.current = currentUserId;

        if (!currentUserId || userChanged || !user?.antiPeepData?.isEnabled) {
            lockedRef.current = false;
            setIsLocked(false);
            setLockReason('');
        }
    }, [user]);

    const canProtectNow = useCallback(() => (
        document.visibilityState === 'visible'
        && calibrationStepRef.current === 'idle'
        && !lockedRef.current
        && latestUser.current?.antiPeepData?.isEnabled
        && hasCurrentEnrollment(latestUser.current.antiPeepData)
    ), []);

    const stopStream = useCallback(() => {
        cameraGenerationRef.current += 1;
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) videoRef.current.srcObject = null;
        setCameraStatus('idle');
    }, []);

    const stopProtection = useCallback(() => {
        startAttemptRef.current += 1;
        protectionGenerationRef.current += 1;
        protectionActiveRef.current = false;
        if (protectionTimerRef.current) {
            clearTimeout(protectionTimerRef.current);
            protectionTimerRef.current = null;
        }
        trackerRef.current = { tracks: [], nextId: 1 };
        setIsProtecting(false);
        stopStream();
    }, [stopStream]);

    const stopCalibrationLoop = useCallback(() => {
        calibrationGenerationRef.current += 1;
        if (calibrationTimerRef.current) {
            clearTimeout(calibrationTimerRef.current);
            calibrationTimerRef.current = null;
        }
    }, []);

    const ensureDetectorLoaded = useCallback(async () => {
        if (!detectorLoadPromiseRef.current) {
            setModelStatus('loading');
            setModelError('');
            detectorLoadPromiseRef.current = loadDetector()
                .then((human) => {
                    setModelStatus('ready');
                    return human;
                })
                .catch((error) => {
                    detectorLoadPromiseRef.current = null;
                    setModelStatus('error');
                    setModelError(error?.message || 'Không thể tải model AI');
                    throw error;
                });
        }
        return detectorLoadPromiseRef.current;
    }, []);

    const ensureAnalysisLoaded = useCallback(async () => {
        await ensureDetectorLoaded();
        if (!analysisLoadPromiseRef.current) {
            analysisLoadPromiseRef.current = loadAnalysisModels().catch((error) => {
                analysisLoadPromiseRef.current = null;
                setModelStatus('error');
                setModelError(error?.message || 'Không thể tải model nhận diện');
                throw error;
            });
        }
        const human = await analysisLoadPromiseRef.current;
        setModelStatus('ready');
        return human;
    }, [ensureDetectorLoaded]);

    const openCamera = useCallback(() => {
        if (streamRef.current?.active) return Promise.resolve(streamRef.current);
        if (!navigator.mediaDevices?.getUserMedia) {
            return Promise.reject(new Error('Trình duyệt không hỗ trợ camera'));
        }

        const generation = cameraGenerationRef.current;
        if (cameraOpenPromiseRef.current?.generation === generation) {
            return cameraOpenPromiseRef.current.promise;
        }

        setCameraStatus('requesting');
        const request = (async () => {
            let stream;
            try {
                stream = await navigator.mediaDevices.getUserMedia(cameraConstraints);
                if (generation !== cameraGenerationRef.current) {
                    stream.getTracks().forEach((track) => track.stop());
                    const cancelled = new Error('Camera request was cancelled');
                    cancelled.name = 'AbortError';
                    throw cancelled;
                }

                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                }

                if (generation !== cameraGenerationRef.current) {
                    stream.getTracks().forEach((track) => track.stop());
                    if (streamRef.current === stream) streamRef.current = null;
                    const cancelled = new Error('Camera request was cancelled');
                    cancelled.name = 'AbortError';
                    throw cancelled;
                }

                setCameraStatus('ready');
                return stream;
            } catch (error) {
                stream?.getTracks().forEach((track) => track.stop());
                if (streamRef.current === stream) streamRef.current = null;
                if (videoRef.current?.srcObject === stream) videoRef.current.srcObject = null;
                if (generation === cameraGenerationRef.current && error.name !== 'AbortError') {
                    setCameraStatus('error');
                }
                throw error;
            }
        })();

        const requestRecord = { generation, promise: request };
        cameraOpenPromiseRef.current = requestRecord;
        request.finally(() => {
            if (cameraOpenPromiseRef.current === requestRecord) {
                cameraOpenPromiseRef.current = null;
            }
        }).catch(() => {});
        return request;
    }, []);

    const runDetection = useCallback((config, shouldRun) => {
        const task = detectionChainRef.current
            .catch(() => {})
            .then(async () => {
                if (!shouldRun() || !videoRef.current) return null;
                return getHuman().detect(videoRef.current, config);
            });
        detectionChainRef.current = task.catch(() => {});
        return task;
    }, []);

    const triggerLock = useCallback((reason) => {
        lockedRef.current = true;
        stopProtection();
        setIsLocked((wasLocked) => {
            if (!wasLocked) setLockReason(reason);
            return true;
        });
    }, [stopProtection]);

    const scheduleProtectionLoop = useCallback((generation, delay) => {
        protectionTimerRef.current = setTimeout(async () => {
            const isCurrent = () => (
                generation === protectionGenerationRef.current
                && protectionActiveRef.current
                && canProtectNow()
                && videoRef.current?.readyState >= 2
            );
            if (!isCurrent()) return;

            let nextDelay = SCAN_DELAY_MS;
            try {
                const scan = await runDetection(scanConfig, isCurrent);
                if (!scan || !isCurrent()) return;

                if (scan.face.length < 2) {
                    trackerRef.current = updateIntruderTracks({
                        ...trackerRef.current,
                        faces: [],
                        now: performance.now(),
                    });
                    nextDelay = trackerRef.current.tracks.length > 0
                        ? ANALYSIS_DELAY_MS
                        : SCAN_DELAY_MS;
                } else {
                    await ensureAnalysisLoaded();
                    if (!isCurrent()) return;

                    const result = await runDetection(analysisConfig, isCurrent);
                    if (!result || !isCurrent()) return;
                    nextDelay = ANALYSIS_DELAY_MS;

                    const human = getHuman();
                    const gallery = latestUser.current?.antiPeepData?.faceDescriptors || [];
                    const similarities = result.face.map((face) => (
                        bestOwnerSimilarity(human, face.embedding, gallery)
                    ));
                    const bestSimilarity = Math.max(...similarities, 0);
                    const ownerIndex = bestSimilarity >= OWNER_MATCH_THRESHOLD
                        ? similarities.indexOf(bestSimilarity)
                        : -1;

                    if (result.face.length < 2 || ownerIndex < 0) {
                        trackerRef.current = updateIntruderTracks({
                            ...trackerRef.current,
                            faces: [],
                            now: performance.now(),
                        });
                    } else {
                        const width = videoRef.current.videoWidth || 320;
                        const height = videoRef.current.videoHeight || 240;
                        const trackedFaces = result.face.map((face, index) => ({
                            box: face.box,
                            embedding: face.embedding,
                            isOwner: index === ownerIndex,
                            attentive: isAttentiveFace(
                                face,
                                getFaceGestures(result, index),
                                width,
                                height,
                            ),
                        }));

                        trackerRef.current = updateIntruderTracks({
                            ...trackerRef.current,
                            faces: trackedFaces,
                            sameIdentity: (a, b) => Boolean(a?.length && b?.length && human.match.similarity(a, b) >= OWNER_MATCH_THRESHOLD),
                            now: performance.now(),
                        });

                        if (trackerRef.current.shouldLock) {
                            triggerLock('Phát hiện người lạ nhìn vào màn hình liên tục 3 giây.');
                        }
                    }
                }
            } catch (error) {
                if (isCurrent()) {
                    console.error('Anti-Peep detection failed:', error);
                    nextDelay = SCAN_DELAY_MS * 2;
                }
            } finally {
                if (isCurrent()) scheduleProtectionLoop(generation, nextDelay);
            }
        }, delay);
    }, [
        canProtectNow,
        ensureAnalysisLoaded,
        runDetection,
        triggerLock,
    ]);

    const startProtection = useCallback(() => {
        if (protectionActiveRef.current) return Promise.resolve();
        if (startPromiseRef.current) return startPromiseRef.current.then(() => { if (!protectionActiveRef.current && canProtectNow()) return startProtection(); });

        const attempt = startAttemptRef.current + 1;
        startAttemptRef.current = attempt;

        const startPromise = (async () => {
            try {
                await ensureDetectorLoaded();
                if (attempt !== startAttemptRef.current || !canProtectNow()) return;

                await openCamera();
                if (attempt !== startAttemptRef.current || !canProtectNow()) return;

                const generation = protectionGenerationRef.current + 1;
                protectionGenerationRef.current = generation;
                protectionActiveRef.current = true;
                trackerRef.current = { tracks: [], nextId: 1 };
                setIsProtecting(true);
                scheduleProtectionLoop(generation, 0);
            } catch (error) {
                if (attempt === startAttemptRef.current && canProtectNow()) {
                    console.error('Unable to start Anti-Peep:', error);
                    toast.error('Không thể bật camera bảo vệ. Hãy kiểm tra quyền camera.');
                }
            }
        })();

        startPromiseRef.current = startPromise;
        startPromise.finally(() => {
            if (startPromiseRef.current === startPromise) startPromiseRef.current = null;
        });
        return startPromise;
    }, [
        canProtectNow,
        ensureDetectorLoaded,
        openCamera,
        scheduleProtectionLoop,
    ]);

    useEffect(() => {
        const shouldProtect = (
            user?.antiPeepData?.isEnabled
            && hasCurrentEnrollment(user.antiPeepData)
            && calibrationStep === 'idle'
            && !isLocked
            && document.visibilityState === 'visible'
        );

        if (shouldProtect) startProtection();
        else stopProtection();
    }, [
        calibrationStep,
        isLocked,
        startProtection,
        stopProtection,
        user,
    ]);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                stopProtection();
                if (calibrationStepRef.current !== 'idle') {
                    stopCalibrationLoop();
                    calibrationStepRef.current = 'idle';
                    setCalibrationStep('idle');
                    setTempPin('');
                    setTempDescriptors([]);
                    setCaptureProgress(0);
                    setLandmarksData(null);
                    setIsAligned(false);
                    autoSamplesRef.current = [];
                    stopStream();
                }
            } else if (canProtectNow()) {
                startProtection();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [
        canProtectNow,
        startProtection,
        stopCalibrationLoop,
        stopProtection,
        stopStream,
    ]);

    useEffect(() => () => {
        startAttemptRef.current += 1;
        cameraGenerationRef.current += 1;
        protectionGenerationRef.current += 1;
        calibrationGenerationRef.current += 1;
        protectionActiveRef.current = false;
        calibrationStepRef.current = 'idle';
        if (protectionTimerRef.current) clearTimeout(protectionTimerRef.current);
        if (calibrationTimerRef.current) clearTimeout(calibrationTimerRef.current);
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
        }
    }, []);

    // Automatic Face Alignment & Sampling Loop
    const scheduleCalibrationLoop = useCallback((generation, delay = 0) => {
        calibrationTimerRef.current = setTimeout(async () => {
            const isCurrent = () => (
                generation === calibrationGenerationRef.current
                && calibrationStepRef.current === 'face'
                && document.visibilityState === 'visible'
                && videoRef.current?.readyState >= 2
            );
            if (!isCurrent()) return;

            try {
                const result = await runDetection(analysisConfig, isCurrent);
                if (!result || !isCurrent()) return;

                if (result.face.length === 0) {
                    setIsAligned(false);
                    setAlignmentStatus('no_face');
                    setGuidanceText('Không tìm thấy khuôn mặt. Hãy nhìn thẳng vào camera.');
                    setLandmarksData(null);
                } else if (result.face.length > 1) {
                    setIsAligned(false);
                    setAlignmentStatus('multiple_faces');
                    setGuidanceText('Phát hiện nhiều người. Hãy đảm bảo bạn ở một mình.');
                    setLandmarksData(null);
                } else {
                    const face = result.face[0];
                    const width = videoRef.current.videoWidth || 320;
                    const height = videoRef.current.videoHeight || 240;
                    const [x, y, faceWidth, faceHeight] = face.box;
                    const areaRatio = (faceWidth * faceHeight) / Math.max(width * height, 1);
                    const centerX = x + faceWidth / 2;
                    const centerY = y + faceHeight / 2;
                    const centered = (
                        Math.abs(centerX - width / 2) <= width * 0.18
                        && Math.abs(centerY - height / 2) <= height * 0.18
                    );
                    const score = face.faceScore || face.boxScore || face.score || 0;

                    setLandmarksData({
                        positions: face.mesh ? face.mesh.map((point) => ({ x: point[0], y: point[1] })) : [],
                        videoWidth: width,
                        videoHeight: height,
                    });

                    if (areaRatio < 0.08) {
                        setIsAligned(false);
                        setAlignmentStatus('too_far');
                        setGuidanceText('Đưa khuôn mặt lại gần hơn.');
                    } else if (areaRatio > 0.52) {
                        setIsAligned(false);
                        setAlignmentStatus('too_close');
                        setGuidanceText('Lùi khuôn mặt lại một chút.');
                    } else if (!centered) {
                        setIsAligned(false);
                        setAlignmentStatus('uncentered');
                        setGuidanceText('Căn chỉnh khuôn mặt vào giữa khung tròn.');
                    } else if (score < 0.50 || !face.embedding?.length) {
                        setIsAligned(false);
                        setAlignmentStatus('poor_quality');
                        setGuidanceText('Khuôn mặt bị mờ hoặc thiếu sáng.');
                    } else {
                        // Face is well-aligned!
                        setIsAligned(true);
                        setAlignmentStatus('aligned');

                        const now = performance.now();
                        if (now - lastSampleTimeRef.current >= 550) {
                            lastSampleTimeRef.current = now;
                            autoSamplesRef.current.push(Array.from(face.embedding));
                            const currentCount = autoSamplesRef.current.length;
                            setCaptureProgress(currentCount);

                            if (currentCount < ENROLLMENT_SAMPLE_COUNT) {
                                setGuidanceText(`Khuôn mặt chuẩn. Đang tự động lưu ${currentCount}/${ENROLLMENT_SAMPLE_COUNT} mẫu...`);
                            } else {
                                // Captured all 5 samples!
                                setTempDescriptors([...autoSamplesRef.current]);
                                calibrationStepRef.current = 'pin';
                                setCalibrationStep('pin');
                                setGuidanceText('Đã ghi nhận đủ 5 mẫu khuôn mặt.');
                                stopStream();
                                toast.success('Ghi nhận khuôn mặt thành công!');
                                return;
                            }
                        }
                    }
                }
            } catch (error) {
                if (isCurrent()) {
                    console.error('Calibration guidance failed:', error);
                    setGuidanceText('Không đọc được khuôn mặt. Hãy thử lại.');
                }
            } finally {
                if (isCurrent()) {
                    scheduleCalibrationLoop(generation, CALIBRATION_DELAY_MS);
                }
            }
        }, delay);
    }, [runDetection, stopStream]);

    const setupCalibration = useCallback(async () => {
        stopProtection();
        stopCalibrationLoop();

        const generation = calibrationGenerationRef.current + 1;
        calibrationGenerationRef.current = generation;
        calibrationStepRef.current = 'face';
        setCalibrationStep('face');
        setGuidanceText('Đang khởi động camera và AI...');
        setIsAligned(false);
        setAlignmentStatus('loading');
        setCaptureProgress(0);
        autoSamplesRef.current = [];
        lastSampleTimeRef.current = 0;
        setTempDescriptors([]);
        setTempPin(latestUser.current?.antiPeepData?.pin || '');

        const isCurrent = () => (
            generation === calibrationGenerationRef.current
            && calibrationStepRef.current === 'face'
            && document.visibilityState === 'visible'
        );

        try {
            await detectionChainRef.current.catch(() => {});
            if (!isCurrent()) return;
            await ensureAnalysisLoaded();
            if (!isCurrent()) return;
            await openCamera();
            if (!isCurrent()) return;
            scheduleCalibrationLoop(generation);
        } catch (error) {
            if (isCurrent()) {
                console.error('Unable to start calibration:', error);
                setGuidanceText('Không thể mở camera hoặc tải AI. Hãy kiểm tra quyền camera rồi thử lại.');
                toast.error('Không thể bắt đầu nhận diện khuôn mặt.');
            }
        }
    }, [
        ensureAnalysisLoaded,
        openCamera,
        scheduleCalibrationLoop,
        stopCalibrationLoop,
        stopProtection,
    ]);

    const handleResetCapture = useCallback(() => {
        autoSamplesRef.current = [];
        lastSampleTimeRef.current = 0;
        setCaptureProgress(0);
        setTempDescriptors([]);
        setIsAligned(false);
        setGuidanceText('Căn chỉnh khuôn mặt vào giữa khung tròn...');
    }, []);

    const saveCalibration = async () => {
        if (tempDescriptors.length !== ENROLLMENT_SAMPLE_COUNT || tempPin.length < 4) return;

        try {
            const payload = {
                faceDescriptor: tempDescriptors[0],
                faceDescriptors: tempDescriptors,
                modelVersion: FACE_MODEL_VERSION,
                pin: tempPin,
                isEnabled: true,
            };
            await axios.put('/api/users/anti-peep', payload);
            updateUser({
                antiPeepData: {
                    ...user?.antiPeepData,
                    isEnabled: payload.isEnabled,
                    faceDescriptor: payload.faceDescriptor,
                    faceDescriptors: payload.faceDescriptors,
                    modelVersion: payload.modelVersion,
                },
            });
            toast.success('Đã lưu Face ID và bật bảo vệ chống nhìn trộm.');
            closeCalibration();
        } catch (error) {
            console.error('Unable to save Face ID:', error);
            toast.error('Không thể lưu dữ liệu Face ID.');
        }
    };

    const closeCalibration = () => {
        stopCalibrationLoop();
        calibrationStepRef.current = 'idle';
        setCalibrationStep('idle');
        setTempPin('');
        setTempDescriptors([]);
        setCaptureProgress(0);
        setLandmarksData(null);
        setIsAligned(false);
        autoSamplesRef.current = [];
        stopStream();
    };

    const handleUnlockPin = async (pinToVerify) => {
        if (!pinToVerify || pinToVerify.length !== 4 || isUnlocking) return false;
        setIsUnlocking(true);
        try {
            const response = await axios.post('/api/users/anti-peep/verify-pin', {
                pin: pinToVerify,
            });
            if (response.data?.valid) {
                lockedRef.current = false;
                setIsLocked(false);
                setLockReason('');
                trackerRef.current = { tracks: [], nextId: trackerRef.current.nextId };
                toast.success('Mở khóa màn hình thành công');
                return true;
            }
            return false;
        } catch (error) {
            toast.error(
                error.response?.data?.message === 'Incorrect PIN'
                    ? 'Mã PIN không đúng'
                    : error.response?.data?.message || 'Không thể xác minh mã PIN',
            );
            return false;
        } finally {
            setIsUnlocking(false);
        }
    };

    const retryModelLoad = () => {
        detectorLoadPromiseRef.current = null;
        analysisLoadPromiseRef.current = null;
        ensureDetectorLoaded().catch(() => {});
    };

    const needsReenrollment = Boolean(
        user?.antiPeepData?.faceDescriptor?.length
        && !hasCurrentEnrollment(user.antiPeepData),
    );

    return (
        <AntiPeepContext.Provider value={{
            isModelsLoaded: modelStatus === 'ready',
            modelStatus,
            modelError,
            cameraStatus,
            isLocked,
            isProtecting,
            needsReenrollment,
            retryModelLoad,
            retryProtection: startProtection,
            setupCalibration,
        }}>
            {children}

            <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '320px',
                    height: '240px',
                    opacity: 0,
                    pointerEvents: 'none',
                    zIndex: -1,
                }}
            />

            <FaceIDCalibrationModal
                isOpen={calibrationStep !== 'idle'}
                stream={streamRef.current}
                step={calibrationStep}
                guidanceText={guidanceText}
                isAligned={isAligned}
                alignmentStatus={alignmentStatus}
                captureProgress={captureProgress}
                captureTarget={ENROLLMENT_SAMPLE_COUNT}
                tempPin={tempPin}
                setTempPin={setTempPin}
                onResetCapture={handleResetCapture}
                onSave={saveCalibration}
                onClose={closeCalibration}
                landmarksData={landmarksData}
            />

            <AntiPeepLockOverlay
                isLocked={isLocked}
                lockReason={lockReason}
                onUnlock={handleUnlockPin}
                isUnlocking={isUnlocking}
            />
        </AntiPeepContext.Provider>
    );
};
