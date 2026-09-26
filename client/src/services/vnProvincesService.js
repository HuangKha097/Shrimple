import axios from 'axios';

// Cache for provinces and wards
let cachedProvinces = null;
const cachedWards = new Map();

/**
 * Normalizes Vietnamese string to non-accent lowercase for smart searching
 * e.g. "Cần Thơ" -> "can tho", "Đà Nẵng" -> "da nang"
 */
export function removeVietnameseTones(str) {
    if (!str) return '';
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .trim();
}

/**
 * Fallback list of 34 provinces after administrative merger
 */
const FALLBACK_PROVINCES = [
    { code: 1, name: "Thành phố Hà Nội" },
    { code: 79, name: "Thành phố Hồ Chí Minh" },
    { code: 31, name: "Thành phố Hải Phòng" },
    { code: 48, name: "Thành phố Đà Nẵng" },
    { code: 92, name: "Thành phố Cần Thơ" },
    { code: 46, name: "Thành phố Huế" },
    { code: 24, name: "Thành phố Bắc Ninh" },
    { code: 22, name: "Thành phố Quảng Ninh" },
    { code: 75, name: "Thành phố Đồng Nai" },
    { code: 68, name: "Tỉnh Lâm Đồng" },
    { code: 56, name: "Tỉnh Khánh Hòa" },
    { code: 66, name: "Tỉnh Đắk Lắk" },
    { code: 52, name: "Tỉnh Gia Lai" },
    { code: 38, name: "Tỉnh Thanh Hóa" },
    { code: 40, name: "Tỉnh Nghệ An" },
    { code: 42, name: "Tỉnh Hà Tĩnh" },
    { code: 44, name: "Tỉnh Quảng Trị" },
    { code: 51, name: "Tỉnh Quảng Ngãi" },
    { code: 80, name: "Tỉnh Tây Ninh" },
    { code: 82, name: "Tỉnh Đồng Tháp" },
    { code: 86, name: "Tỉnh Vĩnh Long" },
    { code: 91, name: "Tỉnh An Giang" },
    { code: 96, name: "Tỉnh Cà Mau" },
    { code: 19, name: "Tỉnh Thái Nguyên" },
    { code: 25, name: "Tỉnh Phú Thọ" },
    { code: 33, name: "Tỉnh Hưng Yên" },
    { code: 37, name: "Tỉnh Ninh Bình" },
    { code: 15, name: "Tỉnh Lào Cai" },
    { code: 20, name: "Tỉnh Lạng Sơn" },
    { code: 4, name: "Tỉnh Cao Bằng" },
    { code: 8, name: "Tỉnh Tuyên Quang" },
    { code: 11, name: "Tỉnh Điện Biên" },
    { code: 12, name: "Tỉnh Lai Châu" },
    { code: 14, name: "Tỉnh Sơn La" }
];

/**
 * Fetch all Vietnam provinces from open-api-provinces V2 (after merger)
 * GitHub: https://github.com/hongquan/vn-open-api-provinces/
 */
export async function fetchAllProvincesV2() {
    if (cachedProvinces && cachedProvinces.length > 0) {
        return cachedProvinces;
    }

    try {
        const response = await axios.get('https://provinces.open-api.vn/api/v2/p/', {
            timeout: 8000
        });
        if (Array.isArray(response.data) && response.data.length > 0) {
            cachedProvinces = response.data.map((p) => ({
                code: p.code,
                name: p.name,
                divisionType: p.division_type,
                codename: p.codename
            }));
            return cachedProvinces;
        }
    } catch {
        // Fallback post-merger provinces list if network fails
    }

    cachedProvinces = FALLBACK_PROVINCES;
    return cachedProvinces;
}

/**
 * Filtered provinces getter with Vietnamese diacritic search support
 */
export async function getProvincesV2(query = "") {
    const list = await fetchAllProvincesV2();
    const rawQ = (query || "").trim().toLowerCase();
    const toneQ = removeVietnameseTones(query);

    if (!rawQ) {
        return list;
    }

    return list.filter((p) => {
        const rawName = p.name.toLowerCase();
        const toneName = removeVietnameseTones(p.name);
        const codeName = (p.codename || "").toLowerCase();
        return rawName.includes(rawQ) || toneName.includes(toneQ) || codeName.includes(toneQ);
    });
}

/**
 * Fetch wards/districts for a province (depth=2 in V2) with diacritic search
 */
export async function getWardsV2(provinceCode, query = "") {
    if (!provinceCode) return [];

    let wards = cachedWards.get(provinceCode);
    if (!wards) {
        try {
            const response = await axios.get(`https://provinces.open-api.vn/api/v2/p/${provinceCode}?depth=2`, {
                timeout: 8000
            });
            wards = (response.data?.wards || []).map((w) => ({
                code: w.code,
                name: w.name,
                codename: w.codename,
                divisionType: w.division_type
            }));
            cachedWards.set(provinceCode, wards);
        } catch {
            wards = [];
        }
    }

    const rawQ = (query || "").trim().toLowerCase();
    const toneQ = removeVietnameseTones(query);

    if (!rawQ) {
        return wards;
    }

    return wards.filter((w) => {
        const rawName = w.name.toLowerCase();
        const toneName = removeVietnameseTones(w.name);
        const codeName = (w.codename || "").toLowerCase();
        return rawName.includes(rawQ) || toneName.includes(toneQ) || codeName.includes(toneQ);
    });
}

/**
 * Comprehensive database of Universities, Academies, and Colleges in Vietnam
 */
const VIETNAM_UNIVERSITIES = [
    // Đại học Quốc gia Hà Nội
    "Đại học Quốc gia Hà Nội (VNU)",
    "Đại học Công nghệ - ĐHQG Hà Nội (UET)",
    "Đại học Khoa học Tự nhiên - ĐHQG Hà Nội (HUS)",
    "Đại học Khoa học Xã hội và Nhân văn - ĐHQG Hà Nội (USSH)",
    "Đại học Kinh tế - ĐHQG Hà Nội (UEB)",
    "Đại học Ngoại ngữ - ĐHQG Hà Nội (ULIS)",
    "Đại học Y Dược - ĐHQG Hà Nội (UMP-VNU)",
    "Đại học Giáo dục - ĐHQG Hà Nội (UEd)",
    "Đại học Luật - ĐHQG Hà Nội (VNU-UL)",
    "Đại học Việt Nhật - ĐHQG Hà Nội (VJU)",
    "Trường Quốc tế - ĐHQG Hà Nội (IS-VNU)",
    "Trường Quản trị và Kinh doanh - ĐHQG Hà Nội (HSB)",

    // Đại học Quốc gia TP. Hồ Chí Minh
    "Đại học Quốc gia TP. Hồ Chí Minh (VNU-HCM)",
    "Đại học Bách khoa - ĐHQG TP.HCM (HCMUT)",
    "Đại học Khoa học Tự nhiên - ĐHQG TP.HCM (HCMUS)",
    "Đại học Khoa học Xã hội và Nhân văn - ĐHQG TP.HCM (USSH HCM)",
    "Đại học Quốc tế - ĐHQG TP.HCM (HCMIU)",
    "Đại học Công nghệ Thông tin - ĐHQG TP.HCM (UIT)",
    "Đại học Kinh tế - Luật - ĐHQG TP.HCM (UEL)",
    "Đại học An Giang - ĐHQG TP.HCM (AGU)",

    // Đại học & Học viện Kỹ thuật - Công nghệ
    "Đại học Bách khoa Hà Nội (HUST)",
    "Học viện Bưu chính Viễn thông (PTIT)",
    "Học viện Kỹ thuật Mật mã (KMA)",
    "Đại học Giao thông Vận tải (UTC)",
    "Đại học Giao thông Vận tải Phân hiệu TP.HCM (UTC2)",
    "Đại học Giao thông Vận tải TP.HCM (UTH)",
    "Đại học Xây dựng Hà Nội (HUCE)",
    "Đại học Kiến trúc Hà Nội (HAU)",
    "Đại học Kiến trúc TP.HCM (UAH)",
    "Đại học Công nghiệp Hà Nội (HaUI)",
    "Đại học Công nghiệp TP.HCM (IUH)",
    "Đại học Công thương TP.HCM (HUIT)",
    "Đại học Sư phạm Kỹ thuật TP.HCM (HCMUTE)",
    "Đại học Sư phạm Kỹ thuật Hưng Yên (UTEHY)",
    "Đại học Sư phạm Kỹ thuật Vinh",
    "Đại học Sư phạm Kỹ thuật Nam Định",
    "Đại học Thủy lợi (TLU)",
    "Đại học Mỏ - Địa chất (HUMG)",
    "Đại học Điện lực (EPU)",
    "Đại học Công nghệ Giao thông Vận tải (UTT)",
    "Đại học Hàng hải Việt Nam (VMU)",
    "Đại học Tài nguyên và Môi trường Hà Nội (HUNRE)",
    "Đại học Tài nguyên và Môi trường TP.HCM",

    // Khối Kinh tế, Quản trị, Tài chính, Luật
    "Đại học Kinh tế Quốc dân (NEU)",
    "Đại học Ngoại thương (FTU)",
    "Đại học Ngoại thương Cơ sở 2 - TP.HCM (FTU2)",
    "Đại học Kinh tế TP.HCM (UEH)",
    "Đại học Thương mại (TMU)",
    "Học viện Tài chính (AOF)",
    "Học viện Ngân hàng (BA)",
    "Đại học Ngân hàng TP.HCM (HUB)",
    "Đại học Tài chính - Marketing (UFM)",
    "Đại học Kinh tế - Kỹ thuật Công nghiệp (UNETI)",
    "Học viện Ngoại giao (DAV)",
    "Học viện Báo chí và Tuyên truyền (AJC)",
    "Học viện Hành chính Quốc gia (NAPA)",
    "Đại học Luật Hà Nội (HLU)",
    "Đại học Luật TP.HCM (ULAW)",

    // Khối Y - Dược
    "Đại học Y Hà Nội (HMU)",
    "Đại học Y Dược TP.HCM (UMP)",
    "Đại học Dược Hà Nội (HUP)",
    "Đại học Y Dược Cần Thơ (CTUMP)",
    "Đại học Y Dược Hải Phòng",
    "Đại học Y Dược Thái Bình",
    "Đại học Y khoa Phạm Ngọc Thạch (PNTU)",
    "Đại học Điều dưỡng Nam Định",
    "Đại học Y tế Công cộng (HUPH)",

    // Khối Sư phạm, Xã hội, Ngoại ngữ
    "Đại học Sư phạm Hà Nội (HNUE)",
    "Đại học Sư phạm Hà Nội 2 (HPU2)",
    "Đại học Sư phạm TP.HCM (HCMUE)",
    "Đại học Hà Nội (HANU)",
    "Đại học Ngoại ngữ - Tin học TP.HCM (HUFLIT)",
    "Đại học Sư phạm Nghệ thuật Trung ương",
    "Đại học Sư phạm Thể dục Thể thao Hà Nội",
    "Đại học Sư phạm Thể dục Thể thao TP.HCM",

    // Khối Đại học vùng & Địa phương
    "Đại học Đà Nẵng (UD)",
    "Đại học Bách khoa - ĐH Đà Nẵng (DUT)",
    "Đại học Kinh tế - ĐH Đà Nẵng (DUE)",
    "Đại học Sư phạm - ĐH Đà Nẵng (UED)",
    "Đại học Ngoại ngữ - ĐH Đà Nẵng (UFL)",
    "Đại học Sư phạm Kỹ thuật - ĐH Đà Nẵng",
    "Đại học Công nghệ Thông tin và Truyền thông Việt - Hàn (VKU)",
    "Đại học Kỹ thuật Y - Dược Đà Nẵng",
    "Đại học Huế",
    "Đại học Y Dược - ĐH Huế",
    "Đại học Sư phạm - ĐH Huế",
    "Đại học Khoa học - ĐH Huế",
    "Đại học Kinh tế - ĐH Huế",
    "Đại học Ngoại ngữ - ĐH Huế",
    "Đại học Nông Lâm - ĐH Huế",
    "Đại học Nghệ thuật - ĐH Huế",
    "Đại học Luật - ĐH Huế",
    "Đại học Thái Nguyên (TNU)",
    "Đại học Y Dược - ĐH Thái Nguyên",
    "Đại học Kỹ thuật Công nghiệp - ĐH Thái Nguyên",
    "Đại học Sư phạm - ĐH Thái Nguyên",
    "Đại học Nông Lâm - ĐH Thái Nguyên",
    "Đại học Công nghệ Thông tin và Truyền thông - ĐH Thái Nguyên (ICTU)",
    "Đại học Kinh tế và Quản trị Kinh doanh - ĐH Thái Nguyên",
    "Đại học Khoa học - ĐH Thái Nguyên",
    "Đại học Cần Thơ (CTU)",
    "Đại học Vinh",
    "Đại học Quy Nhơn (QNU)",
    "Đại học Nha Trang (NTU)",
    "Đại học Tây Nguyên (TTN)",
    "Đại học Đà Lạt (DLU)",
    "Đại học Hồng Đức",
    "Đại học Hải Phòng",
    "Đại học Hùng Vương",
    "Đại học Hà Tĩnh",
    "Đại học Quảng Bình",
    "Đại học Quảng Nam",
    "Đại học Phú Yên",
    "Đại học Khánh Hòa",
    "Đại học Tiền Giang",
    "Đại học Đồng Tháp",
    "Đại học Bạc Liêu",
    "Đại học Trà Vinh (TVU)",
    "Đại học Kiên Giang",
    "Đại học Đồng Nai",
    "Đại học Thủ Dầu Một (TDMU)",

    // Trường Tư thục & Quốc tế
    "Đại học FPT",
    "Đại học RMIT Việt Nam",
    "Đại học Tôn Đức Thắng (TDTU)",
    "Đại học Văn Lang (VLU)",
    "Đại học Hoa Sen (HSU)",
    "Đại học Công nghệ TP.HCM (HUTECH)",
    "Đại học Kinh tế - Tài chính TP.HCM (UEF)",
    "Đại học Quốc tế Hồng Bàng (HIU)",
    "Đại học Sài Gòn (SGU)",
    "Đại học Mở TP.HCM (OU)",
    "Đại học Mở Hà Nội (HOU)",
    "Đại học Thăng Long (TLU)",
    "Đại học Phenikaa",
    "Đại học Đại Nam",
    "Đại học Phương Đông",
    "Đại học Kinh doanh và Công nghệ Hà Nội (HUBT)",
    "Đại học Nguyễn Tất Thành (NTTU)",
    "Đại học Duy Tân (DTU)",
    "Đại học Đông Á",
    "Đại học Kiến trúc Đà Nẵng (DAU)",
    "Đại học VinUniversity (VinUni)",
    "Đại học Fulbright Việt Nam",
    "Đại học Quốc tế Miền Đông (EIU)",
    "Đại học Lạc Hồng (LHU)",
    "Đại học Bà Rịa - Vũng Tàu (BVU)",
    "Đại học Yersin Đà Lạt",
    "Đại học Cửu Long",
    "Đại học Nam Cần Thơ (DNC)",
    "Đại học Tây Đô",
    "Đại học Greenwich Việt Nam",
    "Đại học Swinburne Việt Nam",

    // Khối Quân sự & Công an
    "Học viện Kỹ thuật Quân sự (MTA)",
    "Học viện Quân y",
    "Học viện Hậu cần",
    "Học viện Phòng không - Không quân",
    "Học viện Hải quân",
    "Học viện Biên phòng",
    "Trường Sĩ quan Lục quân 1",
    "Trường Sĩ quan Lục quân 2",
    "Trường Sĩ quan Chính trị",
    "Trường Sĩ quan Thông tin",
    "Học viện An ninh Nhân dân (T01)",
    "Học viện Cảnh sát Nhân dân (T02)",
    "Học viện Chính trị Công an Nhân dân (T03)",
    "Đại học An ninh Nhân dân (T04)",
    "Đại học Cảnh sát Nhân dân (T05)",
    "Đại học Phòng cháy Chữa cháy (T06)",
    "Đại học Kỹ thuật - Hậu cần CAND (T07)",

    // Khối Văn hóa - Nghệ thuật
    "Đại học Mỹ thuật Việt Nam",
    "Đại học Mỹ thuật TP.HCM",
    "Đại học Mỹ thuật Công nghiệp",
    "Học viện Âm nhạc Quốc gia Việt Nam",
    "Nhạc viện TP.HCM",
    "Học viện Âm nhạc Huế",
    "Đại học Sân khấu - Điện ảnh Hà Nội",
    "Đại học Sân khấu - Điện ảnh TP.HCM",
    "Đại học Văn hóa Hà Nội",
    "Đại học Văn hóa TP.HCM"
];

/**
 * Search universities with tone-insensitive search & acronym support
 */
export async function searchUniversities(query) {
    const rawQ = (query || "").trim().toLowerCase();
    const toneQ = removeVietnameseTones(query);

    // Filter local popular universities
    const localMatches = VIETNAM_UNIVERSITIES.filter((name) => {
        if (!rawQ) return true;
        const rawName = name.toLowerCase();
        const toneName = removeVietnameseTones(name);
        return rawName.includes(rawQ) || toneName.includes(toneQ);
    });

    if (!rawQ) {
        return localMatches.slice(0, 10);
    }

    return localMatches.slice(0, 15);
}

/**
 * Curated list of popular Majors / Fields of study
 */
const POPULAR_MAJORS = [
    "Công nghệ thông tin",
    "Khoa học máy tính",
    "Kỹ thuật phần mềm",
    "An toàn thông tin / An ninh mạng",
    "Trí tuệ nhân tạo & Khoa học dữ liệu",
    "Quản trị kinh doanh",
    "Marketing / Digital Marketing",
    "Tài chính - Ngân hàng",
    "Kế toán - Kiểm toán",
    "Kinh doanh quốc tế",
    "Thương mại điện tử",
    "Logistics & Quản lý chuỗi cung ứng",
    "Thiết kế đồ họa & Mỹ thuật đa phương tiện",
    "Truyền thông đa phương tiện & Báo chí",
    "Ngôn ngữ Anh",
    "Ngôn ngữ Nhật",
    "Ngôn ngữ Hàn",
    "Ngôn ngữ Trung",
    "Luật kinh tế / Luật thương mại quốc tế",
    "Y đa khoa",
    "Dược học",
    "Răng - Hàm - Mặt",
    "Kiến trúc",
    "Kỹ thuật xây dựng",
    "Kỹ thuật điện - điện tử",
    "Tự động hóa & Robot",
    "Quản trị dịch vụ du lịch và lữ hành",
    "Quản trị khách sạn",
    "Quan hệ công chúng (PR)"
];

/**
 * Search majors with tone-insensitive search
 */
export function searchMajors(query) {
    const rawQ = (query || "").trim().toLowerCase();
    const toneQ = removeVietnameseTones(query);

    if (!rawQ) {
        return POPULAR_MAJORS.slice(0, 8);
    }

    return POPULAR_MAJORS.filter((m) => {
        const rawName = m.toLowerCase();
        const toneName = removeVietnameseTones(m);
        return rawName.includes(rawQ) || toneName.includes(toneQ);
    }).slice(0, 10);
}
