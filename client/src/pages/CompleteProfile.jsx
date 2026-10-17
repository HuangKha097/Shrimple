import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router";
import { motion as Motion, AnimatePresence } from "motion/react";
import {
    ArrowLeft, ArrowRight, Camera, Check, CheckCircle2, Compass,
    LocateFixed, UserRound, UsersRound, MapPin,
    GraduationCap, Briefcase
} from "lucide-react";
import { toast } from "sonner";
import styles from "../assets/css/CompleteProfile.module.scss";
import { useAuthStore } from "../stores/useAuthStore";
import { useChatStore } from "../stores/useChatStore";
import { ASSET_BASE_URL } from "../config/env";
import XBackground from "../components/ui/animate/XBackground";
import XButton from "../components/ui/animate/XButton";
import XSearchSelect from "../components/ui/animate/XSearchSelect";
import { getProvincesV2, getWardsV2, searchUniversities, searchMajors } from "../services/vnProvincesService";

const steps = [
    {
        title: "Thông tin cá nhân",
        desc: "Tên hiển thị, ngày sinh và @username",
        icon: UserRound,
        optional: false
    },
    {
        title: "Ảnh đại diện",
        desc: "Tải lên ảnh nhận diện của bạn",
        icon: Camera,
        optional: true
    },
    {
        title: "Địa chỉ & Học vấn",
        desc: "Tỉnh thành, trường học, chuyên ngành",
        icon: MapPin,
        optional: true
    },
    {
        title: "Gợi ý bạn bè",
        desc: "Khám phá và kết nối bạn bè mới",
        icon: UsersRound,
        optional: true
    },
];

const profileSchema = z.object({
    displayName: z.string().trim().min(2, "Vui lòng nhập ít nhất 2 ký tự").max(100),
    birthday: z.string()
        .min(1, "Vui lòng chọn ngày sinh")
        .refine((value) => {
            const date = new Date(value);
            return !Number.isNaN(date.getTime()) && date <= new Date();
        }, "Ngày sinh không hợp lệ"),
    username: z.string()
        .trim()
        .min(3, "Tên người dùng ít nhất 3 ký tự")
        .max(20, "Tên người dùng tối đa 20 ký tự")
        .regex(/^[a-zA-Z0-9_]+$/, "Chỉ chứa chữ cái, số và dấu gạch dưới"),
    gender: z.enum(["male", "female", "other"]),
});

const avatarSource = (value) => {
    if (!value) return "";
    return value.startsWith("http") || value.startsWith("blob:") ? value : `${ASSET_BASE_URL}${value}`;
};

const CompleteProfile = () => {
    const navigate = useNavigate();
    const user = useAuthStore((state) => state.user);
    const completeProfile = useAuthStore((state) => state.completeProfile);
    const updateProfile = useAuthStore((state) => state.updateProfile);
    const loading = useAuthStore((state) => state.loading);
    const suggestedFriends = useChatStore((state) => state.suggestedFriends);
    const fetchSuggestedFriends = useChatStore((state) => state.fetchSuggestedFriends);
    const sendRequestAction = useChatStore((state) => state.sendRequestAction);
    const [step, setStep] = useState(user?.isProfileComplete ? 1 : 0);
    const [avatarFile, setAvatarFile] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState(avatarSource(user?.avatarURL));
    const [location, setLocation] = useState({
        province: user?.location?.province || user?.location?.city || "",
        provinceCode: null,
        city: user?.location?.city || user?.location?.province || "",
        ward: user?.location?.ward || "",
        country: user?.location?.country || "Việt Nam",
        latitude: user?.location?.latitude,
        longitude: user?.location?.longitude,
    });
    const [extraInfo, setExtraInfo] = useState({
        school: user?.school || "",
        major: user?.major || "",
        workplace: user?.workplace || "",
        bio: user?.bio || "",
    });
    const [locating, setLocating] = useState(false);
    const [sentRequests, setSentRequests] = useState(() => new Set());
    const [isSuccess, setIsSuccess] = useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm({
        resolver: zodResolver(profileSchema),
        defaultValues: {
            displayName: user?.displayName || "",
            birthday: user?.birthday ? new Date(user.birthday).toISOString().split("T")[0] : "",
            username: user?.username || "",
            gender: user?.gender || "other",
        },
    });

    useEffect(() => {
        if (step === 3) fetchSuggestedFriends();
    }, [step, fetchSuggestedFriends]);

    useEffect(() => () => {
        if (avatarPreview?.startsWith("blob:")) URL.revokeObjectURL(avatarPreview);
    }, [avatarPreview]);

    const goToStep = (nextStep) => setStep(Math.max(0, Math.min(steps.length - 1, nextStep)));

    const saveBasics = async (data) => {
        if (user?.isProfileComplete) {
            goToStep(1);
            return;
        }
        const result = await completeProfile(data);
        if (result.success) goToStep(1);
    };

    const chooseAvatar = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            toast.error("Vui lòng chọn tệp hình ảnh.");
            return;
        }
        if (file.size > 8 * 1024 * 1024) {
            toast.error("Vui lòng chọn ảnh nhỏ hơn 8 MB.");
            return;
        }
        if (avatarPreview?.startsWith("blob:")) URL.revokeObjectURL(avatarPreview);
        setAvatarFile(file);
        setAvatarPreview(URL.createObjectURL(file));
    };

    const saveAvatar = async () => {
        if (avatarFile) {
            const data = new FormData();
            data.append("avatar", avatarFile);
            const result = await updateProfile(data);
            if (!result.success) return;
        }
        goToStep(2);
    };

    const useCurrentLocation = () => {
        if (!navigator.geolocation) {
            toast.error("Trình duyệt không hỗ trợ định vị.");
            return;
        }
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            ({ coords }) => {
                setLocation((current) => ({
                    ...current,
                    latitude: Number(coords.latitude.toFixed(6)),
                    longitude: Number(coords.longitude.toFixed(6)),
                }));
                setLocating(false);
                toast.success("Đã thêm vị trí hiện tại.");
            },
            () => {
                setLocating(false);
                toast.error("Không thể lấy vị trí.");
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
        );
    };

    const handleProvinceChange = (val, opt) => {
        setLocation((prev) => ({
            ...prev,
            province: val,
            provinceCode: opt?.code || null,
            city: val,
            // Reset ward if province changes
            ward: prev.province !== val ? "" : prev.ward
        }));
    };

    const fetchWardsForCurrentProvince = async (query = "") => {
        let code = location.provinceCode;
        if (!code && location.province) {
            const allProvinces = await getProvincesV2("");
            const matched = allProvinces.find(
                (p) => p.name.toLowerCase() === location.province.toLowerCase()
            );
            if (matched) {
                code = matched.code;
            }
        }
        if (!code) return [];
        return await getWardsV2(code, query);
    };

    const saveLocationAndExtra = async () => {
        const hasLocation = Boolean(
            location.province?.trim() || location.city?.trim() || location.ward?.trim()
            || location.latitude !== undefined || location.longitude !== undefined
        );
        const hasExtra = Boolean(
            extraInfo.school?.trim() || extraInfo.major?.trim()
            || extraInfo.workplace?.trim() || extraInfo.bio?.trim()
        );

        if (hasLocation || hasExtra) {
            const data = new FormData();
            if (hasLocation) {
                data.append("location", JSON.stringify({
                    province: location.province?.trim() || "",
                    city: location.city?.trim() || location.province?.trim() || "",
                    ward: location.ward?.trim() || "",
                    country: location.country?.trim() || "Việt Nam",
                    ...(location.latitude !== undefined ? { latitude: location.latitude } : {}),
                    ...(location.longitude !== undefined ? { longitude: location.longitude } : {}),
                }));
            }
            if (extraInfo.school?.trim()) data.append("school", extraInfo.school.trim());
            if (extraInfo.major?.trim()) data.append("major", extraInfo.major.trim());
            if (extraInfo.workplace?.trim()) data.append("workplace", extraInfo.workplace.trim());
            if (extraInfo.bio?.trim()) data.append("bio", extraInfo.bio.trim());

            const result = await updateProfile(data);
            if (!result.success) return;
        }
        goToStep(3);
    };

    const sendFriendRequest = async (friendId) => {
        try {
            await sendRequestAction(friendId);
            setSentRequests((current) => new Set([...current, friendId]));
            toast.success("Đã gửi lời mời.");
        } catch (error) {
            toast.error(error.response?.data?.message || "Không thể gửi lời mời.");
        }
    };

    const finishOnboarding = () => {
        setIsSuccess(true);
        window.setTimeout(() => navigate("/feed"), 2200);
    };

    return (
        <main className={styles["page-wrapper"]}>
            <AnimatePresence>
                {isSuccess && (
                    <Motion.div
                        className={styles["success-overlay"]}
                        role="status"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <Motion.div
                            className={styles["success-icon"]}
                            initial={{ scale: 0.7, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: "spring", damping: 18, stiffness: 280, delay: 0.1 }}
                        >
                            <Check size={40} />
                        </Motion.div>
                        <h2 className={styles["success-title"]}>Thiết lập thành công!</h2>
                        <p className={styles["success-desc"]}>Đang chuyển bạn đến bảng tin…</p>
                        <div className={styles["success-progress-track"]}>
                            <div className={styles["success-progress-fill"]} />
                        </div>
                    </Motion.div>
                )}
            </AnimatePresence>

            {/* Left Journey Panel */}
            <aside className={styles["journey-panel"]}>
                <XBackground />

                <div className={styles["brand-wrapper"]}>
                    <img src="/logo_remove_bg.png" alt="Logo" className={styles["brand-logo"]} />
                </div>

                <div className={styles["journey-header"]}>
                    <h1 className={styles["journey-headline"]}>Hoàn tất hồ sơ</h1>
                    <p className={styles["journey-subheadline"]}>
                        Chỉ vài bước để hoàn thiện thông tin cá nhân và bắt đầu kết nối cùng cộng đồng.
                    </p>
                </div>

                <ol className={styles["step-list"]}>
                    {steps.map((item, index) => {
                        const Icon = item.icon;
                        const isActive = step === index;
                        const isDone = step > index;
                        return (
                            <li
                                key={item.title}
                                className={`${styles["step-item"]} ${isActive ? styles.active : ""} ${isDone ? styles.done : ""}`}
                            >
                                <span className={styles["step-icon"]}>
                                    {isDone ? <Check size={18} /> : <Icon size={18} />}
                                </span>
                                <div className={styles["step-details"]}>
                                    <strong>{item.title}</strong>
                                    <span>{item.desc}</span>
                                </div>
                            </li>
                        );
                    })}
                </ol>
            </aside>

            {/* Right Content Panel */}
            <section className={styles["content-panel"]}>
                <div className={styles["mobile-progress"]}>
                    <div className={styles["mobile-progress-header"]}>
                        <span>Bước {step + 1} / {steps.length}</span>
                        <span>{steps[step].title}</span>
                    </div>
                    <div className={styles["mobile-progress-track"]}>
                        <div
                            className={styles["mobile-progress-bar"]}
                            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
                        />
                    </div>
                </div>

                <AnimatePresence mode="wait">
                    <Motion.div
                        key={step}
                        className={styles["step-card"]}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ type: "spring", damping: 28, stiffness: 350 }}
                    >
                        <div className={styles["step-heading"]}>
                            <h2 className={styles["step-title"]}>{steps[step].title}</h2>
                        </div>

                        {step === 0 && (
                            <form className={styles.form} onSubmit={handleSubmit(saveBasics)}>
                                <div className={styles["field-group"]}>
                                    <label htmlFor="profile-display-name">
                                        <span>Tên hiển thị</span>
                                    </label>
                                    <input
                                        id="profile-display-name"
                                        {...register("displayName")}
                                        placeholder="Tên của bạn"
                                        autoComplete="name"
                                    />
                                    {errors.displayName && (
                                        <small className={styles["field-error"]}>{errors.displayName.message}</small>
                                    )}
                                </div>

                                <div className={styles["two-columns"]}>
                                    <div className={styles["field-group"]}>
                                        <label htmlFor="profile-birthday">
                                            <span>Ngày sinh</span>
                                        </label>
                                        <input
                                            id="profile-birthday"
                                            {...register("birthday")}
                                            type="date"
                                        />
                                        {errors.birthday && (
                                            <small className={styles["field-error"]}>{errors.birthday.message}</small>
                                        )}
                                    </div>

                                    <div className={styles["field-group"]}>
                                        <label htmlFor="profile-username">
                                            <span>Tên người dùng</span>
                                        </label>
                                        <div className={styles["username-input-wrapper"]}>
                                            <span className={styles["at-symbol"]}>@</span>
                                            <input
                                                id="profile-username"
                                                {...register("username")}
                                                placeholder="username"
                                                autoCapitalize="none"
                                            />
                                        </div>
                                        {errors.username && (
                                            <small className={styles["field-error"]}>{errors.username.message}</small>
                                        )}
                                    </div>
                                </div>

                                <div className={styles["field-group"]}>
                                    <label htmlFor="profile-gender">
                                        <span>Giới tính</span>
                                    </label>
                                    <select id="profile-gender" {...register("gender")}>
                                        <option value="other">Tùy chọn</option>
                                        <option value="male">Nam</option>
                                        <option value="female">Nữ</option>
                                    </select>
                                </div>

                                <div className={`${styles["actions-row"]} ${styles.end}`}>
                                    <XButton
                                        type="submit"
                                        variant="primary"
                                        size="lg"
                                        loading={isSubmitting || loading}
                                        className={styles["btn-pill"]}
                                    >
                                        Tiếp tục <ArrowRight size={18} />
                                    </XButton>
                                </div>
                            </form>
                        )}

                        {step === 1 && (
                            <div className={styles["optional-content"]}>
                                <div className={styles["avatar-picker"]}>
                                    <div className={styles["avatar-preview"]}>
                                        {avatarPreview ? (
                                            <img src={avatarPreview} alt="Avatar" />
                                        ) : (
                                            <UserRound size={42} />
                                        )}
                                    </div>
                                    <div className={styles["upload-button-wrapper"]}>
                                        <label className={styles["upload-btn"]}>
                                            <Camera size={18} /> Chọn ảnh
                                            <input
                                                type="file"
                                                accept="image/png,image/jpeg,image/webp,image/gif"
                                                onChange={chooseAvatar}
                                            />
                                        </label>
                                        <small className={styles["upload-hint"]}>
                                            Tối đa 8 MB
                                        </small>
                                    </div>
                                </div>

                                <div className={styles["actions-row"]}>
                                    <XButton
                                        variant="outline"
                                        size="md"
                                        onClick={() => goToStep(0)}
                                        className={styles["btn-pill"]}
                                    >
                                        <ArrowLeft size={18} /> Quay lại
                                    </XButton>
                                    <div className={styles["action-buttons-group"]}>
                                        <XButton
                                            variant="ghost"
                                            size="md"
                                            onClick={() => goToStep(2)}
                                            className={styles["btn-pill"]}
                                        >
                                            Bỏ qua
                                        </XButton>
                                        <XButton
                                            variant="primary"
                                            size="md"
                                            onClick={saveAvatar}
                                            loading={loading}
                                            className={styles["btn-pill"]}
                                        >
                                            Tiếp tục <ArrowRight size={18} />
                                        </XButton>
                                    </div>
                                </div>
                            </div>
                        )}

                        {step === 2 && (
                            <div className={styles["optional-content"]}>
                                <button
                                    className={styles["location-btn"]}
                                    type="button"
                                    onClick={useCurrentLocation}
                                    disabled={locating}
                                >
                                    <LocateFixed size={18} className={locating ? "animate-spin" : ""} />
                                    {locating ? "Đang định vị…" : "Sử dụng vị trí hiện tại"}
                                </button>

                                {location.latitude !== undefined && (
                                    <div className={styles["coordinates-badge"]}>
                                        <Compass size={16} />
                                        <span>Đã lưu tọa độ: {location.latitude}, {location.longitude}</span>
                                    </div>
                                )}

                                <div className={styles.divider}>
                                    <span>hoặc chọn theo danh sách</span>
                                </div>

                                {/* Section 1: Khu vực sinh sống */}
                                <div className={styles["section-label"]}>
                                    <MapPin size={16} />
                                    <span>Khu vực sinh sống</span>
                                    <span className={styles["optional-badge"]}>(Tùy chọn)</span>
                                </div>

                                <div className={styles["two-columns"]}>
                                    <div className={styles["field-group"]}>
                                        <label>
                                            <span>Tỉnh / Thành phố</span>
                                            <span className={styles["optional-badge"]}>(34 tỉnh sau sáp nhập)</span>
                                        </label>
                                        <XSearchSelect
                                            value={location.province}
                                            onChange={handleProvinceChange}
                                            fetchOptions={getProvincesV2}
                                            placeholder="Tìm hoặc chọn tỉnh / thành phố..."
                                        />
                                    </div>

                                    <div className={styles["field-group"]}>
                                        <label>
                                            <span>Quận / Huyện / Phường</span>
                                            <span className={styles["optional-badge"]}>(Tùy chọn)</span>
                                        </label>
                                        <XSearchSelect
                                            key={`ward-${location.province || 'none'}`}
                                            value={location.ward}
                                            onChange={(val) => setLocation((prev) => ({ ...prev, ward: val }))}
                                            fetchOptions={fetchWardsForCurrentProvince}
                                            placeholder={location.province ? "Tìm hoặc chọn quận / huyện / phường..." : "Vui lòng chọn tỉnh / thành trước"}
                                            disabled={!location.province}
                                        />
                                    </div>
                                </div>

                                {/* Section 2: Học vấn & Chuyên môn */}
                                <div className={styles["section-label"]}>
                                    <GraduationCap size={16} />
                                    <span>Học vấn & Chuyên môn</span>
                                    <span className={styles["optional-badge"]}>(Tùy chọn)</span>
                                </div>

                                <div className={styles["two-columns"]}>
                                    <div className={styles["field-group"]}>
                                        <label>
                                            <span>Trường học / Đại học</span>
                                            <span className={styles["optional-badge"]}>(Tùy chọn)</span>
                                        </label>
                                        <XSearchSelect
                                            value={extraInfo.school}
                                            onChange={(val) => setExtraInfo((prev) => ({ ...prev, school: val }))}
                                            fetchOptions={searchUniversities}
                                            placeholder="Tìm hoặc gõ tên trường học..."
                                        />
                                    </div>

                                    <div className={styles["field-group"]}>
                                        <label>
                                            <span>Chuyên ngành</span>
                                            <span className={styles["optional-badge"]}>(Tùy chọn)</span>
                                        </label>
                                        <XSearchSelect
                                            value={extraInfo.major}
                                            onChange={(val) => setExtraInfo((prev) => ({ ...prev, major: val }))}
                                            fetchOptions={searchMajors}
                                            placeholder="Tìm hoặc gõ chuyên ngành..."
                                        />
                                    </div>
                                </div>

                                {/* Section 3: Việc làm & Giới thiệu */}
                                <div className={styles["section-label"]}>
                                    <Briefcase size={16} />
                                    <span>Công việc & Giới thiệu</span>
                                    <span className={styles["optional-badge"]}>(Tùy chọn)</span>
                                </div>

                                <div className={styles["field-group"]}>
                                    <label htmlFor="profile-workplace">
                                        <span>Nơi làm việc</span>
                                        <span className={styles["optional-badge"]}>(Tùy chọn)</span>
                                    </label>
                                    <input
                                        id="profile-workplace"
                                        value={extraInfo.workplace}
                                        onChange={(e) => setExtraInfo((prev) => ({ ...prev, workplace: e.target.value }))}
                                        placeholder="Công ty, tổ chức hoặc nghề nghiệp..."
                                    />
                                </div>

                                <div className={styles["field-group"]}>
                                    <label htmlFor="profile-bio">
                                        <span>Tiểu sử</span>
                                        <span className={styles["optional-badge"]}>(Tùy chọn)</span>
                                    </label>
                                    <textarea
                                        id="profile-bio"
                                        className={styles["bio-textarea"]}
                                        value={extraInfo.bio}
                                        maxLength={160}
                                        onChange={(e) => setExtraInfo((prev) => ({ ...prev, bio: e.target.value }))}
                                        placeholder="Mô tả ngắn về bản thân bạn..."
                                        rows={3}
                                    />
                                    <span className={styles["char-counter"]}>
                                        {extraInfo.bio.length} / 160
                                    </span>
                                </div>

                                <div className={styles["actions-row"]}>
                                    <XButton
                                        variant="outline"
                                        size="md"
                                        onClick={() => goToStep(1)}
                                        className={styles["btn-pill"]}
                                    >
                                        <ArrowLeft size={18} /> Quay lại
                                    </XButton>
                                    <div className={styles["action-buttons-group"]}>
                                        <XButton
                                            variant="ghost"
                                            size="md"
                                            onClick={() => goToStep(3)}
                                            className={styles["btn-pill"]}
                                        >
                                            Bỏ qua
                                        </XButton>
                                        <XButton
                                            variant="primary"
                                            size="md"
                                            onClick={saveLocationAndExtra}
                                            loading={loading}
                                            className={styles["btn-pill"]}
                                        >
                                            Tiếp tục <ArrowRight size={18} />
                                        </XButton>
                                    </div>
                                </div>
                            </div>
                        )}

                        {step === 3 && (
                            <div className={styles["optional-content"]}>
                                <div className={styles["suggestions-grid"]}>
                                    {suggestedFriends.length === 0 ? (
                                        <div className={styles["empty-suggestions"]}>
                                            <UsersRound size={28} />
                                            <p>Chưa có gợi ý nào</p>
                                        </div>
                                    ) : (
                                        suggestedFriends.slice(0, 6).map((friend) => (
                                            <article key={friend._id} className={styles["friend-card"]}>
                                                <div className={styles["friend-avatar"]}>
                                                    {friend.avatarURL ? (
                                                        <img src={avatarSource(friend.avatarURL)} alt="" />
                                                    ) : (
                                                        <UserRound size={18} />
                                                    )}
                                                </div>
                                                <div className={styles["friend-info"]}>
                                                    <strong>{friend.displayName}</strong>
                                                    <small>@{friend.username || "user"}</small>
                                                </div>
                                                <button
                                                    type="button"
                                                    disabled={sentRequests.has(friend._id)}
                                                    onClick={() => sendFriendRequest(friend._id)}
                                                    className={`${styles["add-friend-btn"]} ${sentRequests.has(friend._id) ? styles.sent : ""}`}
                                                >
                                                    {sentRequests.has(friend._id) ? (
                                                        <>
                                                            <Check size={14} /> Đã gửi
                                                        </>
                                                    ) : (
                                                        "Theo dõi"
                                                    )}
                                                </button>
                                            </article>
                                        ))
                                    )}
                                </div>

                                <div className={styles["actions-row"]}>
                                    <XButton
                                        variant="outline"
                                        size="md"
                                        onClick={() => goToStep(2)}
                                        className={styles["btn-pill"]}
                                    >
                                        <ArrowLeft size={18} /> Quay lại
                                    </XButton>
                                    <XButton
                                        variant="primary"
                                        size="lg"
                                        onClick={finishOnboarding}
                                        className={styles["btn-pill"]}
                                    >
                                        <CheckCircle2 size={18} /> Hoàn tất
                                    </XButton>
                                </div>
                            </div>
                        )}
                    </Motion.div>
                </AnimatePresence>
            </section>
        </main>
    );
};

export default CompleteProfile;
