import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion as Motion, AnimatePresence } from 'motion/react';
import { Html5Qrcode } from 'html5-qrcode';
import { toast } from 'sonner';
import { MagicTreeScene } from '../magic-tree/scene';
import {
  SEASONS,
  SEASON_ORDER,
  BLOSSOM_SWATCHES,
} from '../magic-tree/scene/palette';
import { SPECIES, SPECIES_ORDER } from '../magic-tree/scene/species';
import {
  SpringIcon,
  SummerIcon,
  AutumnIcon,
  ShareIcon,
  OakIcon,
  PineIcon,
  WillowIcon,
  BirchIcon,
} from '../magic-tree/ui/icons';
import '../magic-tree/styles.css';
import { chatService } from '../../services/chatService.js';
import { useChatStore } from '../../stores/useChatStore.js';
import { 
  ScanLine, 
  X, 
  Trees, 
  ArrowLeft, 
  Image as ImageIcon, 
  Flashlight, 
  SwitchCamera, 
  RefreshCw, 
  AlertCircle, 
  Loader2 
} from 'lucide-react';

const SEASON_ICONS = {
  spring: SpringIcon,
  summer: SummerIcon,
  autumn: AutumnIcon,
};

const SPECIES_ICONS = {
  oak: OakIcon,
  pine: PineIcon,
  willow: WillowIcon,
  birch: BirchIcon,
};

const REBUILD_DELAY = 450;

const TreeQRCodeModal = ({
  isOpen,
  onClose,
  type = 'user',
  title = '',
  dataValue = '',
  name = '',
  subText = '',
  avatarUrl = '',
}) => {
  const navigate = useNavigate();
  const { fetchConversations, setActiveConversationId } = useChatStore();

  const canvasRef = useRef(null);
  const dockRef = useRef(null);
  const sceneRef = useRef(null);
  const html5QrCodeRef = useRef(null);
  const fileScanInputRef = useRef(null);
  const scanSessionRef = useRef(0);

  const defaultUrl = dataValue || (
    type === 'group'
      ? `${window.location.origin}/chat?joinGroup=true`
      : `${window.location.origin}/feed`
  );

  const [draft, setDraft] = useState(defaultUrl);
  const [committed, setCommitted] = useState(defaultUrl);
  const [season, setSeason] = useState('summer');
  const [species, setSpecies] = useState('oak');
  const [blossom, setBlossom] = useState('blush');
  const [mode, setMode] = useState('tree'); // 'tree' | 'code'
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);
  const [isCameraStarting, setIsCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [cameraDevices, setCameraDevices] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState(null);

  // Sync incoming dataValue
  useEffect(() => {
    if (dataValue) {
      setDraft(dataValue);
      setCommitted(dataValue);
    }
  }, [dataValue]);

  const palette = useMemo(() => {
    const base = SEASONS[season];
    if (season !== 'spring') return base;
    const swatch = BLOSSOM_SWATCHES.find((s) => s.id === blossom) ?? BLOSSOM_SWATCHES[0];
    return { ...base, leaf: [...swatch.leaf], qrLeaf: [...swatch.qr] };
  }, [season, blossom]);

  // Create the scene when the modal opens; later effects update its live settings.
  const sceneInputsRef = useRef({ committed, palette, species });
  useEffect(() => {
    sceneInputsRef.current = { committed, palette, species };
  }, [committed, palette, species]);

  // ---- 3D Scene Lifecycle ----
  useEffect(() => {
    if (!isOpen || isScannerOpen || !canvasRef.current) return;

    const { committed: initialText, palette: initialPalette, species: initialSpecies } = sceneInputsRef.current;
    const scene = new MagicTreeScene(canvasRef.current, initialText, initialPalette, SPECIES[initialSpecies]);
    sceneRef.current = scene;

    const onResize = () => scene.resize();
    window.addEventListener('orientationchange', onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(canvasRef.current);

    return () => {
      window.removeEventListener('orientationchange', onResize);
      ro.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
  }, [isOpen, isScannerOpen]);

  useEffect(() => {
    sceneRef.current?.setPalette(palette);
  }, [palette]);

  useEffect(() => {
    sceneRef.current?.setText(committed);
  }, [committed]);

  useEffect(() => {
    sceneRef.current?.setMode(mode);
  }, [mode]);

  useEffect(() => {
    sceneRef.current?.setSpecies(species);
  }, [species]);

  useEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    const report = () => sceneRef.current?.setDockHeight(el.getBoundingClientRect().height);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isScannerOpen, isOpen]);

  useEffect(() => {
    const t = window.setTimeout(() => setCommitted(draft.trim() || defaultUrl), REBUILD_DELAY);
    return () => window.clearTimeout(t);
  }, [draft, defaultUrl]);

  // ---- Camera & Scanner Controls ----
  const stopCamera = useCallback(async () => {
    // Invalidate any ongoing start operation
    scanSessionRef.current++;
    setScannerActive(false);
    setIsCameraStarting(false);
    setIsTorchOn(false);

    if (html5QrCodeRef.current) {
      const qrScanner = html5QrCodeRef.current;
      html5QrCodeRef.current = null;
      try {
        if (qrScanner.isScanning) {
          await qrScanner.stop();
        }
      } catch (err) {
        console.warn("Failed to stop Html5Qrcode cleanly:", err);
      }
      try {
        qrScanner.clear();
      } catch (e) {}
    }

    // Safety fallback: ensure any video element stream tracks are explicitly stopped
    try {
      const videoEl = document.querySelector('#qr-camera-reader-3d video');
      if (videoEl && videoEl.srcObject) {
        const stream = videoEl.srcObject;
        stream.getTracks().forEach((track) => track.stop());
        videoEl.srcObject = null;
      }
    } catch (e) {}
  }, []);

  const handleCloseModal = useCallback(() => {
    stopCamera();
    setIsScannerOpen(false);
    onClose();
  }, [stopCamera, onClose]);

  const handleQRResult = useCallback(async (result) => {
    await stopCamera();
    toast.info("Đã quét mã QR!");

    // 1. Group Invite
    if (result.includes("joinGroup=") || result.includes("/chat?joinGroup=")) {
      try {
        const url = new URL(result);
        const inviteCode = url.searchParams.get("invite") || url.searchParams.get("joinGroup");
        if (inviteCode) {
          const res = await chatService.joinGroupByInvite(inviteCode);
          toast.success("Đã tham gia nhóm thành công!");
          await fetchConversations();
          if (res?.conversation?._id) {
            setActiveConversationId(res.conversation._id);
          }
          handleCloseModal();
          navigate("/chat");
          return;
        }
      } catch (e) {
        console.error("Parse group invite failed", e);
      }
    }

    // 2. Profile link
    if (result.includes("/feed/profile/")) {
      try {
        const parts = result.split("/feed/profile/");
        const targetUid = parts[1]?.split("?")[0];
        if (targetUid) {
          toast.success("Mở hồ sơ người dùng");
          handleCloseModal();
          navigate(`/feed/profile/${targetUid}`);
          return;
        }
      } catch (e) {
        console.error("Parse profile link failed", e);
      }
    }

    if (result.startsWith("http://") || result.startsWith("https://")) {
      window.open(result, "_blank");
    } else {
      toast.info(`Nội dung QR: ${result}`);
    }
    handleCloseModal();
  }, [fetchConversations, handleCloseModal, navigate, setActiveConversationId, stopCamera]);

  const startCamera = useCallback(async (preferredCameraId = null) => {
    // Stop any existing scanner first
    await stopCamera();

    const thisSession = ++scanSessionRef.current;
    setIsCameraStarting(true);
    setCameraError(null);

    // Wait until element exists in DOM
    let el = document.getElementById('qr-camera-reader-3d');
    if (!el) {
      await new Promise((resolve) => setTimeout(resolve, 80));
      el = document.getElementById('qr-camera-reader-3d');
    }

    if (!el || scanSessionRef.current !== thisSession) {
      setIsCameraStarting(false);
      return;
    }

    try {
      const qrScanner = new Html5Qrcode('qr-camera-reader-3d', false);
      html5QrCodeRef.current = qrScanner;

      // Query available camera devices if not fetched yet
      try {
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          setCameraDevices(devices);
        }
      } catch (e) {}

      if (scanSessionRef.current !== thisSession) {
        try { qrScanner.clear(); } catch (e) {}
        html5QrCodeRef.current = null;
        setIsCameraStarting(false);
        return;
      }

      const activeCameraId = preferredCameraId || selectedCameraId;
      const cameraConfig = activeCameraId 
        ? { deviceId: { exact: activeCameraId } }
        : { facingMode: 'environment' };

      await qrScanner.start(
        cameraConfig,
        {
          fps: 15,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const edge = Math.floor(minEdge * 0.72);
            return { width: Math.max(edge, 200), height: Math.max(edge, 200) };
          },
          aspectRatio: 1.0,
        },
        async (decodedText) => {
          if (scanSessionRef.current !== thisSession) return;
          await stopCamera();
          handleQRResult(decodedText);
        },
        () => {
          // Normal frame scan pass
        }
      );

      if (scanSessionRef.current !== thisSession) {
        try {
          if (qrScanner.isScanning) {
            await qrScanner.stop();
          }
          qrScanner.clear();
        } catch (e) {}
        html5QrCodeRef.current = null;
        return;
      }

      setScannerActive(true);
      setIsCameraStarting(false);

      // Check if torch/flashlight is supported
      try {
        const video = document.querySelector('#qr-camera-reader-3d video');
        const track = video?.srcObject?.getVideoTracks()?.[0];
        const capabilities = track?.getCapabilities ? track.getCapabilities() : null;
        setHasTorch(Boolean(capabilities && 'torch' in capabilities));
      } catch (e) {
        setHasTorch(false);
      }
    } catch (err) {
      console.error('Camera startup error:', err);
      if (scanSessionRef.current === thisSession) {
        setIsCameraStarting(false);
        setScannerActive(false);
        setCameraError(
          'Không thể truy cập máy ảnh. Vui lòng kiểm tra quyền truy cập máy ảnh của trình duyệt hoặc tải ảnh QR từ máy.'
        );
      }
    }
  }, [handleQRResult, selectedCameraId, stopCamera]);

  const toggleTorch = useCallback(async () => {
    try {
      const video = document.querySelector('#qr-camera-reader-3d video');
      const track = video?.srcObject?.getVideoTracks()?.[0];
      if (track && hasTorch) {
        const nextTorch = !isTorchOn;
        await track.applyConstraints({
          advanced: [{ torch: nextTorch }],
        });
        setIsTorchOn(nextTorch);
      }
    } catch (err) {
      console.warn('Cannot toggle torch:', err);
      toast.error('Thiết bị không hỗ trợ bật đèn flash');
    }
  }, [hasTorch, isTorchOn]);

  const handleSwitchCamera = useCallback(async () => {
    if (cameraDevices.length <= 1) return;
    const currentIndex = cameraDevices.findIndex((c) => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameraDevices.length;
    const nextDevice = cameraDevices[nextIndex];
    setSelectedCameraId(nextDevice.id);
    await startCamera(nextDevice.id);
  }, [cameraDevices, selectedCameraId, startCamera]);

  const handleToggleScanner = useCallback(() => {
    if (isScannerOpen) {
      stopCamera();
      setIsScannerOpen(false);
    } else {
      setIsScannerOpen(true);
    }
  }, [isScannerOpen, stopCamera]);

  // Auto-start camera when scanner view opens; stop camera when scanner closes
  useEffect(() => {
    if (isOpen && isScannerOpen) {
      startCamera();
    } else {
      stopCamera();
    }
  }, [isOpen, isScannerOpen, startCamera, stopCamera]);

  // Clean up if modal closes or unmounts
  useEffect(() => {
    if (!isOpen) {
      setIsScannerOpen(false);
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, stopCamera]);

  // ---- Actions ----
  const toggleMode = useCallback(() => {
    setMode((m) => (m === 'tree' ? 'code' : 'tree'));
  }, []);

  const share = useCallback(async () => {
    const url = committed;
    try {
      if (navigator.share) {
        await navigator.share({
          title: title || 'Magic Tree 3D QR',
          text: `Mã QR 3D Cây Thần (${name || 'QtmShrimple'})`,
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success('Đã sao chép liên kết vào bộ nhớ tạm!');
    } catch (err) {
      if (err?.name !== 'AbortError') {
        navigator.clipboard.writeText(url);
        toast.success('Đã sao chép liên kết vào bộ nhớ tạm!');
      }
    }
  }, [committed, title, name]);

  const onCanvasKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleMode();
    }
  };

  const handleFileUploadScan = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const html5Qr = new Html5Qrcode("qr-camera-reader-3d-temp", false);
      const decodedText = await html5Qr.scanFile(file, true);
      await stopCamera();
      handleQRResult(decodedText);
    } catch (err) {
      console.error("File scan error:", err);
      toast.error("Không tìm thấy mã QR trong hình ảnh này");
    } finally {
      if (fileScanInputRef.current) {
        fileScanInputRef.current.value = '';
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <Motion.div 
          className="magic-tree-modal-root" 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          onClick={handleCloseModal}
        >
          <Motion.div 
            className="magic-tree-frame" 
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ type: "spring", stiffness: 450, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="stage" style={{ background: palette.ground }}>
              {/* Top User / Group Avatar & Name */}
              <div className="tree-user-badge">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={name || "Avatar"} className="tree-user-avatar" />
                ) : (
                  <div className="tree-user-placeholder">
                    {(name ? name[0] : (type === 'group' ? 'G' : 'U')).toUpperCase()}
                  </div>
                )}
                <div className="tree-user-meta">
                  <span className="tree-user-name">{name || (type === 'group' ? "Nhóm" : "Người dùng")}</span>
                  {subText && <span className="tree-user-sub">{subText}</span>}
                </div>
              </div>

              {/* Top Right Action Tools */}
              <div className="top-nav-buttons-container">
                <div className="top-nav-buttons">
                  <Motion.button
                    type="button"
                    className="tree-top-btn"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.94 }}
                    onClick={handleToggleScanner}
                    title={isScannerOpen ? "Trở lại QR của tôi" : "Quét mã QR"}
                  >
                    {isScannerOpen ? <Trees size={14} /> : <ScanLine size={14} />}
                    <span>{isScannerOpen ? "QR của tôi" : "Quét mã"}</span>
                  </Motion.button>


                  <Motion.button
                    type="button"
                    className="tree-top-btn close-btn"
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={handleCloseModal}
                    title="Đóng"
                    aria-label="Đóng"
                  >
                    <X size={16} />
                  </Motion.button>
                </div>
              </div>

              {/* Main 3D Canvas or Banking QR Camera Scanner */}
              {!isScannerOpen ? (
                <>
                  <canvas
                    ref={canvasRef}
                    className="stage__canvas"
                    role="button"
                    tabIndex={0}
                    aria-label="Magic Tree 3D"
                    onClick={toggleMode}
                    onKeyDown={onCanvasKey}
                  />

                  {/* Bottom Dock Controls */}
                  <div className="dock" ref={dockRef}>
                    <div className="field">
                      <input
                        className="field__input"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="https://your-link.com"
                        aria-label="Link to encode"
                        spellCheck={false}
                        autoCapitalize="off"
                        autoCorrect="off"
                      />
                      <Motion.button
                        className="field__action"
                        type="button"
                        onClick={share}
                        whileHover={{ scale: 1.06 }}
                        whileTap={{ scale: 0.92 }}
                        aria-label="Chia sẻ liên kết"
                        title="Sao chép / Chia sẻ liên kết"
                      >
                        <ShareIcon />
                      </Motion.button>
                    </div>

                    {/* Species Selector */}
                    <div className="trees">
                      {SPECIES_ORDER.map((id) => {
                        const Icon = SPECIES_ICONS[id];
                        return (
                          <Motion.button
                            key={id}
                            className="tree"
                            type="button"
                            title={SPECIES[id].label}
                            aria-pressed={species === id}
                            onClick={() => setSpecies(id)}
                            whileTap={{ scale: 0.93 }}
                          >
                            <Icon />
                            <span className="tree__label">{SPECIES[id].label}</span>
                          </Motion.button>
                        );
                      })}
                    </div>

                    {/* Season Selector */}
                    <div className="seasons">
                      {SEASON_ORDER.map((id) => {
                        const Icon = SEASON_ICONS[id];
                        return (
                          <Motion.button
                            key={id}
                            className="season"
                            type="button"
                            aria-pressed={season === id}
                            onClick={() => setSeason(id)}
                            whileTap={{ scale: 0.93 }}
                          >
                            <Icon />
                            <span className="season__label">{SEASONS[id].label}</span>
                          </Motion.button>
                        );
                      })}
                    </div>

                    {/* Spring Blossom Swatches */}
                    <div className="blossoms">
                      {season === 'spring' &&
                        BLOSSOM_SWATCHES.map((s) => (
                          <Motion.button
                            key={s.id}
                            className="blossom"
                            type="button"
                            aria-pressed={blossom === s.id}
                            aria-label={`${s.label} blossom`}
                            style={{ background: s.leaf[0] }}
                            onClick={() => setBlossom(s.id)}
                            whileHover={{ scale: 1.25 }}
                            whileTap={{ scale: 0.9 }}
                          />
                        ))}
                    </div>
                  </div>
                </>
              ) : (
                /* Banking-Grade QR Camera Scanner Panel */
                <Motion.div 
                  className="tree-scanner-panel bank-scanner-theme"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Scanner Header */}
                  <div className="bank-scanner-header">
                    <Motion.button
                      type="button"
                      className="bank-header-btn"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.94 }}
                      onClick={handleToggleScanner}
                      title="Quay lại QR của tôi"
                    >
                      <ArrowLeft size={16} />
                      <span>QR của tôi</span>
                    </Motion.button>

                    <div className="bank-header-center">
                      <span className="bank-header-title">Quét mã QR</span>
                    </div>

                    <Motion.button
                      type="button"
                      className="bank-header-btn close"
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.92 }}
                      onClick={handleCloseModal}
                      title="Đóng"
                      aria-label="Đóng"
                    >
                      <X size={18} />
                    </Motion.button>
                  </div>

                  {/* Stage & Viewfinder */}
                  <div className="bank-scanner-stage">
                    <div id="qr-camera-reader-3d" className="bank-camera-host" />
                    <div id="qr-camera-reader-3d-temp" style={{ display: 'none' }} />

                    {/* Dark Vignette Mask with Center Transparent Cutout */}
                    <div className="bank-viewfinder-overlay">
                      <div className="bank-reticle-cutout">
                        <span className="reticle-corner top-left" />
                        <span className="reticle-corner top-right" />
                        <span className="reticle-corner bottom-left" />
                        <span className="reticle-corner bottom-right" />

                        {scannerActive && <div className="bank-laser-beam" />}

                        {isCameraStarting && (
                          <div className="bank-reticle-loading">
                            <Loader2 className="bank-spinner-icon" size={36} />
                            <span>Đang kết nối camera...</span>
                          </div>
                        )}

                        {scannerActive && (
                          <div className="bank-reticle-crosshair">
                            <div className="crosshair-h" />
                            <div className="crosshair-v" />
                          </div>
                        )}
                      </div>

                      {!cameraError && (
                        <div className="bank-guide-pill">
                          <ScanLine size={16} className="guide-icon" />
                          <span>Đặt mã QR vào trong khung để quét</span>
                        </div>
                      )}

                      {cameraError && (
                        <div className="bank-camera-error-card">
                          <div className="error-icon-bubble">
                            <AlertCircle size={26} />
                          </div>
                          <h4>Không thể mở máy ảnh</h4>
                          <p>{cameraError}</p>
                          <div className="error-actions">
                            <button
                              type="button"
                              className="error-btn-retry"
                              onClick={() => startCamera()}
                            >
                              <RefreshCw size={15} />
                              <span>Thử lại</span>
                            </button>
                            <button
                              type="button"
                              className="error-btn-upload"
                              onClick={() => fileScanInputRef.current?.click()}
                            >
                              <ImageIcon size={15} />
                              <span>Tải ảnh QR từ máy</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Hidden file input */}
                  <input
                    type="file"
                    ref={fileScanInputRef}
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleFileUploadScan}
                  />

                  {/* Bottom Banking Toolbar */}
                  <div className="bank-scanner-bottom-toolbar">
                    <div className="bank-bottom-actions">
                      <Motion.button
                        type="button"
                        className="bank-circle-btn"
                        whileHover={{ scale: 1.08 }}
                        whileTap={{ scale: 0.92 }}
                        onClick={() => fileScanInputRef.current?.click()}
                        title="Tải ảnh QR từ máy"
                        aria-label="Tải ảnh QR từ máy"
                      >
                        <ImageIcon size={22} />
                      </Motion.button>

                      {hasTorch && (
                        <Motion.button
                          type="button"
                          className={`bank-circle-btn ${isTorchOn ? 'active-torch' : ''}`}
                          whileHover={{ scale: 1.08 }}
                          whileTap={{ scale: 0.92 }}
                          onClick={toggleTorch}
                          title={isTorchOn ? "Tắt đèn flash" : "Bật đèn flash"}
                          aria-label={isTorchOn ? "Tắt đèn flash" : "Bật đèn flash"}
                        >
                          <Flashlight size={22} />
                        </Motion.button>
                      )}

                      {cameraDevices.length > 1 && (
                        <Motion.button
                          type="button"
                          className="bank-circle-btn"
                          whileHover={{ scale: 1.08 }}
                          whileTap={{ scale: 0.92 }}
                          onClick={handleSwitchCamera}
                          title="Đổi camera"
                          aria-label="Đổi camera"
                        >
                          <SwitchCamera size={22} />
                        </Motion.button>
                      )}
                    </div>
                  </div>
                </Motion.div>
              )}
            </div>
          </Motion.div>
        </Motion.div>
      )}
    </AnimatePresence>
  );
};

export default TreeQRCodeModal;
