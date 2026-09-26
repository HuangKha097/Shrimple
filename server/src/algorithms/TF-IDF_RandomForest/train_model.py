import pandas as pd
import re
import os
import sys
from pyvi import ViTokenizer
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, accuracy_score, confusion_matrix
import joblib
import numpy as np

# --- CẤU HÌNH ---
EXCEL_FILE_PATH = './du_lieu_tin_tuc.xlsx'   # Dữ liệu 1000 dòng
TEXT_COLUMN_NAME = 'content'
LABEL_COLUMN_NAME = 'label'
VIETNAMESE_STOPWORDS_PATH = './vietnamese-stopwords.txt'
MODEL_SAVE_PATH = './fake_news_rf_model.pkl'

# --- HÀM XỬ LÝ DỮ LIỆU ---

def load_stopwords(file_path):
    """Đọc danh sách stopword và chuẩn hóa format (thêm gạch dưới)."""
    if not os.path.exists(file_path):
        print(f"Không tìm thấy file stopword tại '{file_path}'. Bỏ qua.")
        return []
    
    with open(file_path, 'r', encoding='utf-8') as f:
        #  Tokenize stopword để khớp với văn bản (ví dụ: 'mặc dù' -> 'mặc_dù')
        stopwords = {ViTokenizer.tokenize(line.strip()) for line in f if line.strip()}
        
    print(f"Tải {len(stopwords)} stopword thành công.")
    return list(stopwords)

def preprocess_text(text):
    """Tiền xử lý văn bản cơ bản."""
    if not isinstance(text, str):
        return ""
    text = text.lower()
    text = re.sub(r"http\S+", "", text)     # Xóa URL

    text = re.sub(r"[^\w\s]", " ", text)    # Xóa ký tự đặc biệt
    text = re.sub(r"\s+", " ", text).strip()
    return text

def vi_tokenizer(text):
    """Tách từ tiếng Việt tạo token có gạch dưới."""
    tokenized = ViTokenizer.tokenize(text)
    return tokenized.split()

def load_data(file_path, text_col, label_col):
    """Đọc file dữ liệu và xử lý."""
    try:
        df = pd.read_excel(file_path)
        if text_col not in df.columns or label_col not in df.columns:
            print(f"Thiếu cột '{text_col}' hoặc '{label_col}'.")
            sys.exit(1)

        # Xử lý dữ liệu
        df[text_col] = df[text_col].apply(preprocess_text)
        df[label_col] = pd.to_numeric(df[label_col], errors='coerce')
        
        # Loại bỏ dòng lỗi/rỗng
        df = df.dropna(subset=[text_col, label_col])
        df = df[df[text_col].str.len() > 0]
        df[label_col] = df[label_col].astype(int)

        print(f"Dữ liệu hợp lệ: {len(df)} mẫu")
        print("Thống kê nhãn:")
        print(df[label_col].value_counts())
        return df[text_col], df[label_col]
    except Exception as e:
        print(f"Lỗi đọc dữ liệu: {e}")
        sys.exit(1)

 
def main():
    print("Bắt đầu huấn luyện mô hình Random Forest phân loại tin thật/giả...")
    
    # 1. Load Stopwords 
    stopwords = load_stopwords(VIETNAMESE_STOPWORDS_PATH)

    if not os.path.exists(EXCEL_FILE_PATH):
        print(f"Không tìm thấy file '{EXCEL_FILE_PATH}'")
        return

    # 2. Load Data
    X, y = load_data(EXCEL_FILE_PATH, TEXT_COLUMN_NAME, LABEL_COLUMN_NAME)

    # 3. TF-IDF
    print("Trích xuất đặc trưng TF-IDF...")
    tfidf = TfidfVectorizer(
        tokenizer=vi_tokenizer,
        stop_words=stopwords if stopwords else None,
        max_df=0.85,    # Bỏ các từ xuất hiện > 85% văn bản (quá phổ biến)
        min_df=2,       # Bỏ các từ xuất hiện < 2 lần (quá hiếm - sửa thành 2 cho an toàn hơn 1)
        max_features=15000,
        token_pattern=None 
    )

    X_tfidf = tfidf.fit_transform(X)
    print(f"Số lượng đặc trưng: {len(tfidf.get_feature_names_out())}")

    # 4. Cấu hình Random Forest
    rf_model = RandomForestClassifier(
        n_estimators=300,
        max_depth=20,          
        min_samples_split=5,
        min_samples_leaf=2,     
        class_weight='balanced',
        random_state=42,
        n_jobs=-1
    )

    # 5. Chia tập train/test
    X_train, X_test, y_train, y_test = train_test_split(
        X_tfidf, y, test_size=0.2, random_state=42, stratify=y
    )

    # 6. Huấn luyện
    print("Đang huấn luyện Random Forest...")
    rf_model.fit(X_train, y_train)
    print(" Huấn luyện hoàn tất!")

    # 7. Đánh giá
    y_pred = rf_model.predict(X_test)
    print("\nMa trận nhầm lẫn:")
    print(confusion_matrix(y_test, y_pred))
    print("\nBáo cáo chi tiết:")
    print(classification_report(y_test, y_pred, target_names=['Thật (0)', 'Giả (1)']))
    print(f"Độ chính xác kiểm thử: {accuracy_score(y_test, y_pred)*100:.2f}%")

    # 8. Lưu mô hình
    joblib.dump((rf_model, tfidf), MODEL_SAVE_PATH)
    print(f"Đã lưu mô hình vào: {MODEL_SAVE_PATH}")

    # 9. Dự đoán thử (Test thực tế)
    print("\n--- DỰ ĐOÁN THỬ ---")
    test_articles = [
        "Lập sàn giao dịch giả, lừa đảo hàng chục tỷ đồng của nhà đầu tư",
        "Công an Hà Nội phát hiện 20 tấn gà 'bẩn' sắp tuồn ra chợ, nhà hàng",
        "Tâm sự của thầy giáo lên tiếng giải cứu 2 cháu nhỏ bị cha xích nhốt",
        "cứu thêm 4 nạn nhân trong ô-tô sau vụ sập cầu Phong Châu",
        "Phó chủ tịch Pfizer bị bắt"
    ]
    
    for text in test_articles:
        clean_text = preprocess_text(text)
        # Transform  dùng  vectorizer
        vec = tfidf.transform([clean_text]) 
        pred = rf_model.predict(vec)[0]
        prob = rf_model.predict_proba(vec)[0][pred]
        
        label_text = "GIẢ (1)" if pred == 1 else "THẬT (0)"
        print(f"\n: {text}")
        print(f"Kết quả: {label_text} | Độ tin cậy: {prob*100:.2f}%")

if __name__ == "__main__":
    main()