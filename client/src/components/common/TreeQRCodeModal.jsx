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
import { Download, ScanLine, X, Camera, Upload, Trees } from 'lucide-react';

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

  // ---- 3D Scene Lifecycle ----
  useEffect(() => {
    if (!isOpen || isScannerOpen || !canvasRef.current) return;

    const scene = new MagicTreeScene(canvasRef.current, committed, palette, SPECIES[species]);
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

  // ---- Scanner Lifecycle Cleanup ----
  useEffect(() => {
    return () => {
      if (html5QrCodeRef.current && scannerActive) {
        html5QrCodeRef.current.stop().catch(() => {});
      }
    };
  }, [scannerActive]);

  // ---- Actions ----
  const toggleMode = useCallback(() => {
    setMode((m) => (m === 'tree' ? 'code' : 'tree'));
  }, []);

  const handleDownload = () => {
    if (!canvasRef.current) return;
    try {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      const a = document.createElement('a');
      a.download = `MagicTree-3D-QR-${name || 'tree'}.png`;
      a.href = dataUrl;
      a.click();
      toast.success("Đã tải xuống hình ảnh 3D Magic Tree!");
    } catch (err) {
      console.error("Failed to download image", err);
      toast.error("Không thể tải hình ảnh");
    }
  };

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

  const handleStartCameraScan = async () => {
    try {
      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode("qr-camera-reader-3d");
      }
      setScannerActive(true);
      await html5QrCodeRef.current.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          handleQRResult(decodedText);
          if (html5QrCodeRef.current) {
            html5QrCodeRef.current.stop().catch(() => {});
            setScannerActive(false);
          }
        },
        () => {}
      );
    } catch (err) {
      console.error("Camera scan error:", err);
      toast.error("Không thể mở máy ảnh. Vui lòng cấp quyền hoặc tải ảnh lên để quét.");
      setScannerActive(false);
    }
  };

  const handleFileUploadScan = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const html5Qr = new Html5Qrcode("qr-camera-reader-3d-temp", false);
      const decodedText = await html5Qr.scanFile(file, true);
      handleQRResult(decodedText);
    } catch (err) {
      console.error("File scan error:", err);
      toast.error("Không tìm thấy mã QR trong hình ảnh này");
    }
  };

  const handleQRResult = async (result) => {
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
          onClose();
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
          onClose();
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
    onClose();
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
          onClick={onClose}
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
                    onClick={() => {
                      if (scannerActive && html5QrCodeRef.current) {
                        html5QrCodeRef.current.stop().catch(() => {});
                        setScannerActive(false);
                      }
                      setIsScannerOpen(!isScannerOpen);
                    }}
                    title={isScannerOpen ? "Trở lại cây 3D" : "Quét mã QR"}
                  >
                    {isScannerOpen ? <Trees size={14} /> : <ScanLine size={14} />}
                    <span>{isScannerOpen ? "Cây 3D" : "Quét mã"}</span>
                  </Motion.button>

                  {!isScannerOpen && (
                    <Motion.button
                      type="button"
                      className="tree-top-btn"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.94 }}
                      onClick={handleDownload}
                      title="Tải ảnh QR 3D"
                    >
                      <Download size={14} />
                      <span>Tải ảnh</span>
                    </Motion.button>
                  )}

                  <Motion.button
                    type="button"
                    className="tree-top-btn close-btn"
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={onClose}
                    title="Đóng"
                    aria-label="Đóng"
                  >
                    <X size={16} />
                  </Motion.button>
                </div>
              </div>

              {/* Main 3D Canvas */}
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
                /* QR Camera & File Scanner Panel */
                <Motion.div 
                  className="tree-scanner-panel"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Scanner Header with explicit Close button */}
                  <div className="scanner-header">
                    <div className="scanner-title-group">
                      <div className="scanner-icon-bubble">
                        <ScanLine size={18} />
                      </div>
                      <div className="scanner-header-text">
                        <span className="scanner-title">Quét mã QR</span>
                        <span className="scanner-subtitle">Mở máy ảnh hoặc tải ảnh lên</span>
                      </div>
                    </div>
                    <Motion.button
                      type="button"
                      className="scanner-close-btn"
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.92 }}
                      onClick={() => {
                        if (scannerActive && html5QrCodeRef.current) {
                          html5QrCodeRef.current.stop().catch(() => {});
                          setScannerActive(false);
                        }
                        setIsScannerOpen(false);
                      }}
                      title="Đóng quét mã"
                      aria-label="Đóng quét mã"
                    >
                      <X size={18} />
                    </Motion.button>
                  </div>

                  <div className="scanner-body">
                    <div className="scanner-viewport-wrap">
                      <div id="qr-camera-reader-3d" className="scanner-view-box">
                        {!scannerActive && (
                          <div className="scanner-idle-placeholder">
                            <div className="scanner-reticle">
                              <span className="reticle-corner tl" />
                              <span className="reticle-corner tr" />
                              <span className="reticle-corner bl" />
                              <span className="reticle-corner br" />
                              <ScanLine size={44} className="reticle-center-icon" />
                            </div>
                            <p className="scanner-idle-hint">Bấm mở máy ảnh để bắt đầu quét</p>
                          </div>
                        )}
                      </div>
                      <div id="qr-camera-reader-3d-temp" style={{ display: 'none' }} />
                    </div>

                    <p className="scanner-note">
                      Hướng máy ảnh về phía mã QR hoặc tải ảnh từ thiết bị để tự động kết nối.
                    </p>

                    <input
                      type="file"
                      ref={fileScanInputRef}
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleFileUploadScan}
                    />

                    <div className="scanner-actions">
                      <Motion.button
                        type="button"
                        className="scanner-action-btn secondary"
                        onClick={() => fileScanInputRef.current?.click()}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Upload size={16} />
                        <span>Tải ảnh lên</span>
                      </Motion.button>
                      <Motion.button
                        type="button"
                        className="scanner-action-btn primary"
                        onClick={handleStartCameraScan}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Camera size={16} />
                        <span>{scannerActive ? "Đang quét..." : "Mở máy ảnh"}</span>
                      </Motion.button>
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
