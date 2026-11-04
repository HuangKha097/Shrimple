export const VOICE_TRANSLATION_MODES = {
    AUTO_SUBTITLE: 'auto_subtitle',
    VOICE_TO_VOICE: 'voice_to_voice',
};

export const VOICE_TARGET_LANGUAGES = [
    {
        code: 'en',
        short: 'EN',
        label: 'Tiếng Anh (English)',
        nativeName: 'English',
        speechLang: 'en-US',
        description: 'Tắt âm gốc • Dịch & phát âm Tiếng Anh',
    },
    {
        code: 'vi',
        short: 'VI',
        label: 'Tiếng Việt (Vietnamese)',
        nativeName: 'Tiếng Việt',
        speechLang: 'vi-VN',
        description: 'Tắt âm gốc • Dịch & phát âm Tiếng Việt',
    },
    {
        code: 'zh',
        short: 'ZH',
        label: 'Tiếng Trung (中文)',
        nativeName: '中文',
        speechLang: 'zh-CN',
        description: 'Tắt âm gốc • Dịch & phát âm Tiếng Trung',
    },
];

export const normalizeAppLanguage = (lang) => {
    if (!lang || typeof lang !== 'string') return 'vi';
    const lower = lang.trim().toLowerCase();
    if (lower.startsWith('en')) return 'en';
    if (lower.startsWith('zh')) return 'zh';
    return 'vi';
};

export const getLanguageMeta = (langCode) => {
    const normalized = normalizeAppLanguage(langCode);
    return (
        VOICE_TARGET_LANGUAGES.find((item) => item.code === normalized) ||
        VOICE_TARGET_LANGUAGES[1]
    );
};

export const serializeVoiceMessageContent = ({
    mode = VOICE_TRANSLATION_MODES.AUTO_SUBTITLE,
    sourceLang = 'vi',
    targetLang = null,
    originalTranscript = null,
    translatedText = null,
    translatedAudioUrl = null,
} = {}) => {
    const isVoiceToVoice =
        mode === VOICE_TRANSLATION_MODES.VOICE_TO_VOICE && Boolean(targetLang);
    const normalizedSource = normalizeAppLanguage(sourceLang);
    const normalizedTarget = isVoiceToVoice
        ? normalizeAppLanguage(targetLang)
        : null;

    return JSON.stringify({
        type: 'voice_note',
        label: 'Tin nhắn thoại',
        voiceTranslation: {
            mode: isVoiceToVoice
                ? VOICE_TRANSLATION_MODES.VOICE_TO_VOICE
                : VOICE_TRANSLATION_MODES.AUTO_SUBTITLE,
            sourceLang: normalizedSource,
            targetLang: normalizedTarget,
            muteOriginal: isVoiceToVoice,
            originalTranscript:
                typeof originalTranscript === 'string' && originalTranscript.trim()
                    ? originalTranscript.trim()
                    : null,
            translatedText:
                typeof translatedText === 'string' && translatedText.trim()
                    ? translatedText.trim()
                    : null,
            translatedAudioUrl:
                typeof translatedAudioUrl === 'string' && translatedAudioUrl.trim()
                    ? translatedAudioUrl.trim()
                    : null,
        },
    });
};

export const parseVoiceMessageContent = (rawContent) => {
    const defaultMeta = {
        label:
            typeof rawContent === 'string' && rawContent.trim()
                ? rawContent.trim()
                : 'Tin nhắn thoại',
        voiceTranslation: {
            mode: VOICE_TRANSLATION_MODES.AUTO_SUBTITLE,
            sourceLang: 'vi',
            targetLang: null,
            muteOriginal: false,
            originalTranscript: null,
            translatedText: null,
            translatedAudioUrl: null,
        },
    };

    if (!rawContent || typeof rawContent !== 'string') {
        return defaultMeta;
    }

    const trimmed = rawContent.trim();
    if (!trimmed.startsWith('{')) {
        return defaultMeta;
    }

    try {
        const parsed = JSON.parse(trimmed);
        if (!parsed || typeof parsed !== 'object' || !parsed.voiceTranslation) {
            return defaultMeta;
        }

        const vt = parsed.voiceTranslation;
        const isVoiceToVoice =
            vt.mode === VOICE_TRANSLATION_MODES.VOICE_TO_VOICE &&
            Boolean(vt.targetLang);

        return {
            label:
                typeof parsed.label === 'string' && parsed.label.trim()
                    ? parsed.label.trim()
                    : 'Tin nhắn thoại',
            voiceTranslation: {
                mode: isVoiceToVoice
                    ? VOICE_TRANSLATION_MODES.VOICE_TO_VOICE
                    : VOICE_TRANSLATION_MODES.AUTO_SUBTITLE,
                sourceLang: normalizeAppLanguage(vt.sourceLang || 'vi'),
                targetLang: isVoiceToVoice
                    ? normalizeAppLanguage(vt.targetLang)
                    : null,
                muteOriginal:
                    typeof vt.muteOriginal === 'boolean'
                        ? vt.muteOriginal
                        : isVoiceToVoice,
                originalTranscript:
                    typeof vt.originalTranscript === 'string' &&
                    vt.originalTranscript.trim()
                        ? vt.originalTranscript.trim()
                        : null,
                translatedText:
                    typeof vt.translatedText === 'string' && vt.translatedText.trim()
                        ? vt.translatedText.trim()
                        : null,
                translatedAudioUrl:
                    typeof vt.translatedAudioUrl === 'string' &&
                    vt.translatedAudioUrl.trim()
                        ? vt.translatedAudioUrl.trim()
                        : null,
            },
        };
    } catch {
        return defaultMeta;
    }
};

export const resolveReceiverVoiceView = ({
    voiceTranslation,
    viewerAppLang = 'vi',
    isMe = false,
} = {}) => {
    const vt = voiceTranslation || {
        mode: VOICE_TRANSLATION_MODES.AUTO_SUBTITLE,
        sourceLang: 'vi',
        targetLang: null,
        muteOriginal: false,
    };

    const isVoiceToVoice =
        vt.mode === VOICE_TRANSLATION_MODES.VOICE_TO_VOICE &&
        Boolean(vt.targetLang);
    const normalizedViewerLang = normalizeAppLanguage(viewerAppLang);
    const normalizedSourceLang = normalizeAppLanguage(vt.sourceLang || 'vi');

    const effectiveTargetLang = isVoiceToVoice
        ? normalizeAppLanguage(vt.targetLang)
        : normalizedViewerLang;

    const isDifferentFromViewerLang =
        normalizedSourceLang !== normalizedViewerLang;

    const shouldAutoShowTranslationCard = isVoiceToVoice
        ? true
        : Boolean(
              (!isMe && isDifferentFromViewerLang) ||
                  vt.translatedText ||
                  vt.originalTranscript
          );

    return {
        isVoiceToVoice,
        muteOriginalByDefault: Boolean(isVoiceToVoice && vt.muteOriginal !== false),
        sourceLang: normalizedSourceLang,
        sourceLangMeta: getLanguageMeta(normalizedSourceLang),
        effectiveTargetLang,
        targetLangMeta: getLanguageMeta(effectiveTargetLang),
        isDifferentFromViewerLang,
        shouldAutoShowTranslationCard,
    };
};
