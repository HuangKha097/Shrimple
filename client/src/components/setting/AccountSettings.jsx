import React, { useState, useEffect, useRef } from 'react';
import classNames from 'classnames/bind';
import { useTranslation } from 'react-i18next';
import styles from '../../assets/css/SettingContainer.module.scss';
import { useAuthStore } from '../../stores/useAuthStore';
import { authService } from '../../services/authService';
import { userSettingsService } from '../../services/userSettingsService';
import { 
    getProvincesV2, 
    searchUniversities, 
    searchMajors 
} from '../../services/vnProvincesService';
import XSearchSelect from '../ui/animate/XSearchSelect';
import { Camera, Pencil, Calendar, MapPin, GraduationCap, Briefcase, BookOpen, User as UserIcon, Eye, Save, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const cx = classNames.bind(styles);

const AccountSettings = ({ handleLogout }) => {
    const { t } = useTranslation();
    const { user, updateUser, signOut, setOnlineVisibility } = useAuthStore();

    const executeLogout = async () => {
        if (handleLogout) {
            handleLogout();
        } else {
            if (confirm(t('settings.signOutConfirm'))) {
                await signOut();
            }
        }
    };

    // Toggle edit mode
    const [isEditing, setIsEditing] = useState(false);

    // Profile form states
    const [displayName, setDisplayName] = useState("");
    const [username, setUsername] = useState("");
    const [bio, setBio] = useState("");
    const [workplace, setWorkplace] = useState("");
    const [school, setSchool] = useState("");
    const [major, setMajor] = useState("");
    const [location, setLocation] = useState("");
    const [birthday, setBirthday] = useState("");
    const [gender, setGender] = useState("other");
    const [avatar, setAvatar] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState(null);
    const [isUpdating, setIsUpdating] = useState(false);

    // Privacy states
    const [showOnlineStatus, setShowOnlineStatus] = useState(true);
    const [birthdayVisibility, setBirthdayVisibility] = useState("full");
    const [showWorkplace, setShowWorkplace] = useState(true);
    const [showSchool, setShowSchool] = useState(true);
    const [showLocation, setShowLocation] = useState(true);
    const [showBio, setShowBio] = useState(true);
    const [isUpdatingPrivacy, setIsUpdatingPrivacy] = useState(false);

    // Password change states
    const [oldPassword, setOldPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [isDeletingAccount, setIsDeletingAccount] = useState(false);

    const fileInputRef = useRef(null);

    // Initialize values from user state
    useEffect(() => {
        if (user) {
            setDisplayName(user.displayName || "");
            setUsername(user.username || "");
            setBio(user.bio || "");
            setWorkplace(user.workplace || "");
            setSchool(user.school || "");
            setMajor(user.major || "");

            // Location can be string or object { province, city, country }
            if (typeof user.location === 'object' && user.location !== null) {
                setLocation(user.location.province || user.location.city || "");
            } else {
                setLocation(user.location || "");
            }

            // Birthday formatted to YYYY-MM-DD
            if (user.birthday) {
                try {
                    const d = new Date(user.birthday);
                    if (!isNaN(d.getTime())) {
                        setBirthday(d.toISOString().split('T')[0]);
                    }
                } catch {
                    setBirthday("");
                }
            } else {
                setBirthday("");
            }

            setGender(user.gender || "other");
            setAvatarPreview(user.avatarURL || null);

            // Privacy settings
            if (user.privacy) {
                setShowOnlineStatus(user.privacy.showOnlineStatus ?? true);
                setBirthdayVisibility(user.privacy.birthdayVisibility || "full");
                setShowWorkplace(user.privacy.showWorkplace ?? true);
                setShowSchool(user.privacy.showSchool ?? true);
                setShowLocation(user.privacy.showLocation ?? true);
                setShowBio(user.privacy.showBio ?? true);
            }
        }
    }, [user]);

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setAvatar(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setAvatarPreview(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleCancelEdit = () => {
        // Reset to current user values
        if (user) {
            setDisplayName(user.displayName || "");
            setUsername(user.username || "");
            setBio(user.bio || "");
            setWorkplace(user.workplace || "");
            setSchool(user.school || "");
            setMajor(user.major || "");
            if (typeof user.location === 'object' && user.location !== null) {
                setLocation(user.location.province || user.location.city || "");
            } else {
                setLocation(user.location || "");
            }
            if (user.birthday) {
                try {
                    const d = new Date(user.birthday);
                    if (!isNaN(d.getTime())) {
                        setBirthday(d.toISOString().split('T')[0]);
                    }
                } catch {
                    setBirthday("");
                }
            } else {
                setBirthday("");
            }
            setGender(user.gender || "other");
            setAvatar(null);
            setAvatarPreview(user.avatarURL || null);
        }
        setIsEditing(false);
    };

    const handleUpdateProfile = async () => {
        setIsUpdating(true);
        try {
            const formData = new FormData();
            formData.append("displayName", displayName);
            formData.append("username", username);
            formData.append("bio", bio);
            formData.append("workplace", workplace);
            formData.append("school", school);
            formData.append("major", major);
            formData.append("gender", gender);

            if (birthday) {
                formData.append("birthday", birthday);
            }

            if (location) {
                formData.append("location", JSON.stringify({
                    province: location.trim(),
                    city: location.trim(),
                    country: "Việt Nam"
                }));
            }

            if (avatar) {
                formData.append("avatar", avatar);
            }

            const updatedUser = await authService.updateProfile(formData);

            if (updatedUser) {
                updateUser(updatedUser);
            }

            toast.success("Cập nhật hồ sơ thành công!");
            setIsEditing(false);
            setAvatar(null);
        } catch (error) {
            console.error("Failed to update profile:", error);
            toast.error(error.response?.data?.message || "Lỗi khi cập nhật hồ sơ");
        } finally {
            setIsUpdating(false);
        }
    };

    // Update individual privacy settings
    const handleUpdatePrivacyField = async (field, value) => {
        setIsUpdatingPrivacy(true);
        try {
            const updatePayload = { [field]: value };
            const updatedPrivacy = await userSettingsService.updatePrivacy(updatePayload);

            updateUser({
                privacy: {
                    ...user?.privacy,
                    ...updatedPrivacy
                }
            });

            if (field === 'showOnlineStatus') {
                setShowOnlineStatus(value);
                setOnlineVisibility(value);
            } else if (field === 'birthdayVisibility') {
                setBirthdayVisibility(value);
            } else if (field === 'showWorkplace') {
                setShowWorkplace(value);
            } else if (field === 'showSchool') {
                setShowSchool(value);
            } else if (field === 'showLocation') {
                setShowLocation(value);
            } else if (field === 'showBio') {
                setShowBio(value);
            }

            toast.success("Đã cập nhật quyền riêng tư!");
        } catch (error) {
            console.error("Failed to update privacy:", error);
            toast.error("Không thể cập nhật quyền riêng tư");
        } finally {
            setIsUpdatingPrivacy(false);
        }
    };

    const handleChangePassword = async () => {
        if (!oldPassword || !newPassword) {
            toast.error("Vui lòng nhập đầy đủ mật khẩu cũ và mới.");
            return;
        }

        if (newPassword.length < 6) {
            toast.error("Mật khẩu mới phải có ít nhất 6 ký tự.");
            return;
        }

        setIsChangingPassword(true);
        try {
            await authService.changePassword(oldPassword, newPassword);
            toast.success("Đổi mật khẩu thành công! Vui lòng đăng nhập lại.");
            setOldPassword("");
            setNewPassword("");

            setTimeout(() => {
                executeLogout();
            }, 2000);
        } catch (error) {
            console.error("Failed to change password:", error);
            toast.error(error.response?.data?.message || "Lỗi khi đổi mật khẩu.");
        } finally {
            setIsChangingPassword(false);
        }
    };

    const handleDeleteAccount = async () => {
        const confirmText = "DELETE MY ACCOUNT";
        const userInput = prompt(`CẢNH BÁO: Hành động này là vĩnh viễn và không thể khôi phục.\nNhập "${confirmText}" để xác nhận:`);
        
        if (userInput !== confirmText) {
            if (userInput !== null) toast.error("Mã xác nhận không chính xác.");
            return;
        }

        setIsDeletingAccount(true);
        try {
            await userSettingsService.deleteAccount();
            toast.success("Tài khoản của bạn đã được xóa.");
            setTimeout(() => {
                executeLogout();
            }, 2500);
        } catch (error) {
            console.error("Failed to delete account:", error);
            toast.error("Không thể xóa tài khoản. Vui lòng liên hệ hỗ trợ.");
        } finally {
            setIsDeletingAccount(false);
        }
    };

    // Format birthday for display
    const formattedBirthday = React.useMemo(() => {
        if (!user?.birthday) return t('settings.notUpdated');
        try {
            const d = new Date(user.birthday);
            if (isNaN(d.getTime())) return t('settings.notUpdated');
            if (birthdayVisibility === 'day_month') {
                return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
            }
            if (birthdayVisibility === 'private') {
                return t('settings.birthdayPrivate');
            }
            return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
        } catch {
            return t('settings.notUpdated');
        }
    }, [user?.birthday, birthdayVisibility, t]);

    const genderLabel = React.useMemo(() => {
        if (user?.gender === 'male') return t('settings.genderMale');
        if (user?.gender === 'female') return t('settings.genderFemale');
        return t('settings.genderOther');
    }, [user?.gender, t]);

    return (
        <>
            <h3>{t('settings.accountTab')}</h3>

            {/* Profile Overview Card (X Style) */}
            {!isEditing ? (
                <div className={cx('profile-view-card')}>
                    <div className={cx('profile-top-row')}>
                        <div className={cx('profile-user-info')}>
                            <img
                                src={user?.avatarURL || "/favicon.png"}
                                alt="Avatar"
                                className={cx('profile-avatar')}
                            />
                            <div className={cx('profile-names')}>
                                <span className={cx('profile-display-name')}>
                                    {user?.displayName || user?.username}
                                </span>
                                <span className={cx('profile-username')}>
                                    @{user?.username || "unknown"}
                                </span>
                            </div>
                        </div>
                        <button
                            type="button"
                            className={cx('btn-edit-profile')}
                            onClick={() => setIsEditing(true)}
                        >
                            <Pencil size={15} />
                            <span>{t('settings.editProfile')}</span>
                        </button>
                    </div>

                    <div className={cx('profile-bio')}>
                        {user?.bio || <span style={{ color: '#71767b' }}>{t('settings.noBio')}</span>}
                    </div>

                    <div className={cx('profile-details-grid')}>
                        <div className={cx('detail-item')}>
                            <Calendar size={16} className={cx('detail-icon')} />
                            <span className={cx('detail-label')}>{t('settings.birthday')}:</span>
                            <span className={cx('detail-val')}>{formattedBirthday}</span>
                            <span className={cx('detail-badge')}>{birthdayVisibility}</span>
                        </div>

                        <div className={cx('detail-item')}>
                            <UserIcon size={16} className={cx('detail-icon')} />
                            <span className={cx('detail-label')}>{t('settings.gender')}:</span>
                            <span className={cx('detail-val')}>{genderLabel}</span>
                        </div>

                        <div className={cx('detail-item')}>
                            <MapPin size={16} className={cx('detail-icon')} />
                            <span className={cx('detail-label')}>{t('settings.location')}:</span>
                            <span className={cx('detail-val')}>
                                {location || t('settings.notUpdated')}
                            </span>
                        </div>

                        <div className={cx('detail-item')}>
                            <GraduationCap size={16} className={cx('detail-icon')} />
                            <span className={cx('detail-label')}>{t('settings.school')}:</span>
                            <span className={cx('detail-val')}>
                                {user?.school || t('settings.notUpdated')}
                            </span>
                        </div>

                        <div className={cx('detail-item')}>
                            <BookOpen size={16} className={cx('detail-icon')} />
                            <span className={cx('detail-label')}>{t('settings.major')}:</span>
                            <span className={cx('detail-val')}>
                                {user?.major || t('settings.notUpdated')}
                            </span>
                        </div>

                        <div className={cx('detail-item')}>
                            <Briefcase size={16} className={cx('detail-icon')} />
                            <span className={cx('detail-label')}>{t('settings.workplace')}:</span>
                            <span className={cx('detail-val')}>
                                {user?.workplace || t('settings.notUpdated')}
                            </span>
                        </div>
                    </div>
                </div>
            ) : (
                /* Profile Edit Mode Form */
                <div className={cx('profile-edit-box')}>
                    <div className={cx('edit-header-badge')}>
                        <Pencil size={14} />
                        <span>{t('settings.editProfile')}</span>
                    </div>

                    {/* Avatar Upload */}
                    <div className={cx('section', 'profile-header')} style={{ borderBottom: 'none', paddingBottom: 16 }}>
                        <div className={cx('avatar-wrapper')} onClick={() => fileInputRef.current?.click()}>
                            <img
                                src={avatarPreview || "/favicon.png"}
                                alt="Avatar"
                                className={cx('avatar-preview')}
                            />
                            <div className={cx('overlay')}>
                                <Camera size={24} />
                            </div>
                            <input
                                type="file"
                                ref={fileInputRef}
                                style={{ display: 'none' }}
                                accept="image/*"
                                onChange={handleFileChange}
                            />
                        </div>
                    </div>

                    <div className={cx('two-cols-row')}>
                        <div className={cx('form-group')}>
                            <label htmlFor="displayName">{t('settings.displayName')}</label>
                            <input
                                type="text"
                                id="displayName"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                placeholder="Tên hiển thị"
                            />
                        </div>

                        <div className={cx('form-group')}>
                            <label htmlFor="username">{t('settings.username')}</label>
                            <input
                                type="text"
                                id="username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="username"
                            />
                        </div>
                    </div>

                    <div className={cx('form-group')}>
                        <label htmlFor="bio">{t('settings.bio')}</label>
                        <textarea
                            id="bio"
                            placeholder="Giới thiệu đôi nét về bản thân..."
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                        />
                    </div>

                    <div className={cx('two-cols-row')}>
                        <div className={cx('form-group')}>
                            <label htmlFor="birthday">{t('settings.birthday')}</label>
                            <input
                                type="date"
                                id="birthday"
                                value={birthday}
                                onChange={(e) => setBirthday(e.target.value)}
                            />
                        </div>

                        <div className={cx('form-group')}>
                            <label htmlFor="gender">{t('settings.gender')}</label>
                            <select
                                id="gender"
                                value={gender}
                                onChange={(e) => setGender(e.target.value)}
                            >
                                <option value="male">{t('settings.genderMale')}</option>
                                <option value="female">{t('settings.genderFemale')}</option>
                                <option value="other">{t('settings.genderOther')}</option>
                            </select>
                        </div>
                    </div>

                    {/* Location with Province API */}
                    <div className={cx('form-group')}>
                        <label>{t('settings.location')}</label>
                        <XSearchSelect
                            value={location}
                            onChange={(val) => setLocation(val)}
                            fetchOptions={getProvincesV2}
                            placeholder="Tìm hoặc chọn tỉnh / thành phố..."
                        />
                    </div>

                    {/* School with University API */}
                    <div className={cx('form-group')}>
                        <label>{t('settings.school')}</label>
                        <XSearchSelect
                            value={school}
                            onChange={(val) => setSchool(val)}
                            fetchOptions={searchUniversities}
                            placeholder="Tìm hoặc chọn trường học / đại học..."
                        />
                    </div>

                    {/* Major with Major API */}
                    <div className={cx('form-group')}>
                        <label>{t('settings.major')}</label>
                        <XSearchSelect
                            value={major}
                            onChange={(val) => setMajor(val)}
                            fetchOptions={searchMajors}
                            placeholder="Tìm hoặc chọn chuyên ngành..."
                        />
                    </div>

                    {/* Workplace */}
                    <div className={cx('form-group')}>
                        <label htmlFor="workplace">{t('settings.workplace')}</label>
                        <input
                            type="text"
                            id="workplace"
                            placeholder="Công ty, tổ chức..."
                            value={workplace}
                            onChange={(e) => setWorkplace(e.target.value)}
                        />
                    </div>

                    {/* Actions */}
                    <div className={cx('edit-actions-row')}>
                        <button
                            type="button"
                            className={cx('btn-cancel')}
                            onClick={handleCancelEdit}
                            disabled={isUpdating}
                        >
                            <X size={16} />
                            <span>{t('settings.cancel')}</span>
                        </button>
                        <button
                            type="button"
                            className={cx('btn-save')}
                            onClick={handleUpdateProfile}
                            disabled={isUpdating}
                        >
                            {isUpdating ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            <span>{isUpdating ? t('settings.saving') : t('settings.saveChanges')}</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Privacy & Visibility Section */}
            <div className={cx('section')}>
                <h4>{t('settings.privacyTitle')}</h4>

                {/* Online Status Mutual Toggle */}
                <div className={cx('privacy-card')}>
                    <div className={cx('privacy-card-header')}>
                        <div className={cx('privacy-title-group')}>
                            <span className={cx('privacy-item-title')}>{t('settings.onlineStatus')}</span>
                            <span className={cx('privacy-item-desc')}>
                                {t('settings.onlineStatusDesc')}
                            </span>
                        </div>
                        <label className={cx('switch')}>
                            <input
                                type="checkbox"
                                checked={showOnlineStatus}
                                onChange={(e) => handleUpdatePrivacyField('showOnlineStatus', e.target.checked)}
                                disabled={isUpdatingPrivacy}
                            />
                            <span className={cx('slider')}></span>
                        </label>
                    </div>
                </div>

                {/* Birthday Visibility Dropdown */}
                <div className={cx('privacy-card')}>
                    <div className={cx('privacy-card-header')}>
                        <div className={cx('privacy-title-group')}>
                            <span className={cx('privacy-item-title')}>{t('settings.birthdayVisibility')}</span>
                            <span className={cx('privacy-item-desc')}>
                                Chọn quyền xem ngày sinh của bạn trên trang cá nhân
                            </span>
                        </div>
                    </div>
                    <div className={cx('form-group')} style={{ marginBottom: 0 }}>
                        <select
                            id="birthdayVisibility"
                            value={birthdayVisibility}
                            onChange={(e) => handleUpdatePrivacyField('birthdayVisibility', e.target.value)}
                            disabled={isUpdatingPrivacy}
                        >
                            <option value="full">{t('settings.birthdayFull')}</option>
                            <option value="day_month">{t('settings.birthdayDayMonth')}</option>
                            <option value="friends">{t('settings.birthdayFriends')}</option>
                            <option value="private">{t('settings.birthdayPrivate')}</option>
                        </select>
                    </div>
                </div>

                {/* Field Visibility Checkboxes (Show/Hide options) */}
                <div className={cx('privacy-card')}>
                    <div className={cx('privacy-card-header')}>
                        <div className={cx('privacy-title-group')}>
                            <span className={cx('privacy-item-title')}>{t('settings.profileVisibility')}</span>
                            <span className={cx('privacy-item-desc')}>
                                Đánh dấu để hiển thị thông tin tương ứng trên hồ sơ công khai
                            </span>
                        </div>
                    </div>

                    <div className={cx('field-checkbox-list')}>
                        <label className={cx('field-checkbox-item')}>
                            <span>
                                <Briefcase size={16} />
                                {t('settings.showWorkplace')}
                            </span>
                            <input
                                type="checkbox"
                                checked={showWorkplace}
                                onChange={(e) => handleUpdatePrivacyField('showWorkplace', e.target.checked)}
                                disabled={isUpdatingPrivacy}
                            />
                        </label>

                        <label className={cx('field-checkbox-item')}>
                            <span>
                                <GraduationCap size={16} />
                                {t('settings.showSchool')}
                            </span>
                            <input
                                type="checkbox"
                                checked={showSchool}
                                onChange={(e) => handleUpdatePrivacyField('showSchool', e.target.checked)}
                                disabled={isUpdatingPrivacy}
                            />
                        </label>

                        <label className={cx('field-checkbox-item')}>
                            <span>
                                <MapPin size={16} />
                                {t('settings.showLocation')}
                            </span>
                            <input
                                type="checkbox"
                                checked={showLocation}
                                onChange={(e) => handleUpdatePrivacyField('showLocation', e.target.checked)}
                                disabled={isUpdatingPrivacy}
                            />
                        </label>

                        <label className={cx('field-checkbox-item')}>
                            <span>
                                <Eye size={16} />
                                {t('settings.showBio')}
                            </span>
                            <input
                                type="checkbox"
                                checked={showBio}
                                onChange={(e) => handleUpdatePrivacyField('showBio', e.target.checked)}
                                disabled={isUpdatingPrivacy}
                            />
                        </label>
                    </div>
                </div>
            </div>

            {/* Security Section */}
            <div className={cx('section')}>
                <h4>{t('settings.security')}</h4>
                <div className={cx('form-group')}>
                    <label htmlFor="oldPassword">{t('settings.currentPassword')}</label>
                    <input
                        type="password"
                        id="oldPassword"
                        placeholder="••••••••"
                        value={oldPassword}
                        onChange={(e) => setOldPassword(e.target.value)}
                    />
                </div>
                <div className={cx('form-group')}>
                    <label htmlFor="newPassword">{t('settings.newPassword')}</label>
                    <input
                        type="password"
                        id="newPassword"
                        placeholder="••••••••"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                    />
                </div>
                <button
                    className={cx("save-btn")}
                    onClick={handleChangePassword}
                    disabled={isChangingPassword}
                    style={{ marginTop: '1rem' }}
                >
                    {isChangingPassword ? t('settings.changingPassword') : t('settings.changePassword')}
                </button>
            </div>

            {/* Danger Zone */}
            <div className={cx('section', 'danger-zone')}>
                <h4>{t('settings.dangerZone')}</h4>
                <p>{t('settings.deleteAccountDesc')}</p>
                <button 
                    className={cx("delete-btn")} 
                    onClick={handleDeleteAccount}
                    disabled={isDeletingAccount}
                >
                    {isDeletingAccount ? "Đang xóa..." : t('settings.deleteAccount')}
                </button>
            </div>

            <button className={cx("sign-out-btn")} onClick={executeLogout}>
                {t('settings.signOut')}
            </button>
        </>
    );
};

export default AccountSettings;