export const FACE_MODEL_VERSION = 'human-faceres-v3.3.6';
export const OWNER_MATCH_THRESHOLD = 0.5;

const baseConfig = {
    backend: 'webgl',
    modelBasePath: '/models/human/',
    cacheModels: true,
    warmup: 'none',
    filter: {
        enabled: true,
        width: 320,
        height: 240,
        autoBrightness: true,
    },
    face: {
        enabled: true,
        detector: {
            maxDetected: 4,
            minConfidence: 0.45,
            minSize: 32,
            rotation: false,
            skipFrames: 0,
            skipTime: 0,
        },
        mesh: { enabled: false },
        iris: { enabled: false },
        description: { enabled: false },
        emotion: { enabled: false },
        antispoof: { enabled: false },
        liveness: { enabled: false },
    },
    body: { enabled: false },
    hand: { enabled: false },
    object: { enabled: false },
    segmentation: { enabled: false },
    gesture: { enabled: false },
};

export const scanConfig = {
    face: {
        detector: { maxDetected: 4 },
        mesh: { enabled: false },
        iris: { enabled: false },
        description: { enabled: false },
    },
    gesture: { enabled: false },
};

export const analysisConfig = {
    face: {
        detector: { maxDetected: 4 },
        mesh: { enabled: true },
        iris: { enabled: true },
        description: {
            enabled: true,
            skipFrames: 0,
            skipTime: 0,
        },
    },
    gesture: { enabled: true },
};

let humanInstance;
let humanLibraryPromise;

const getOrCreateHuman = async () => {
    if (!humanLibraryPromise) humanLibraryPromise = import('@vladmandic/human');
    const humanLibrary = await humanLibraryPromise;
    if (!humanInstance) humanInstance = new humanLibrary.Human(baseConfig);
    return humanInstance;
};

export const getHuman = () => {
    if (!humanInstance) throw new Error('Anti-Peep AI has not been initialized');
    return humanInstance;
};

export const loadDetector = async () => {
    const human = await getOrCreateHuman();
    await human.load(scanConfig);
    return human;
};

export const loadAnalysisModels = async () => {
    const human = await getOrCreateHuman();
    await human.load(analysisConfig);
    return human;
};

export const bestOwnerSimilarity = (human, embedding, gallery) => {
    if (!embedding?.length || !Array.isArray(gallery) || gallery.length === 0) return 0;
    const descriptors = gallery.filter((descriptor) => (
        Array.isArray(descriptor) && descriptor.length === embedding.length
    ));
    if (descriptors.length === 0) return 0;
    return human.match.find(embedding, descriptors).similarity;
};

export const getFaceGestures = (result, index) => {
    const gestures = result.gesture || [];
    return {
        face: gestures
            .filter((entry) => entry.face === index)
            .map((entry) => entry.gesture),
        iris: gestures
            .filter((entry) => entry.iris === index)
            .map((entry) => entry.gesture),
    };
};

export const isAttentiveFace = (face, gestures, videoWidth, videoHeight) => {
    const areaRatio = (face.box[2] * face.box[3]) / Math.max(videoWidth * videoHeight, 1);
    return (
        areaRatio >= 0.025
        && gestures.face.includes('facing center')
        && gestures.iris.includes('looking center')
    );
};
