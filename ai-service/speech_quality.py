"""Local speech policies. Formatting may change punctuation/case, never lexical content."""
import re
import unicodedata

PUNCTUATION = frozenset('.,!?;:')
HANGING_VI = frozenset(('và nhưng vì nếu khi để của với thì rằng là hoặc mà cho tại đang sẽ đã còn muốn cần nên gồm'.split()))


def words(text):
    return re.findall(r'\w+', unicodedata.normalize('NFC', text).casefold())


def unfinished_vietnamese(text):
    tokens = words(text)
    return bool(tokens and tokens[-1] in HANGING_VI)


def safe_punctuation(original, candidate):
    """Reject additions/deletions, changed diacritics/numbers/technical symbols and wrappers."""
    if not isinstance(candidate, str):
        return original
    candidate = unicodedata.normalize('NFC', candidate).strip()
    original_nfc = unicodedata.normalize('NFC', original)
    if (not candidate or len(candidate) > len(original_nfc)*1.3+40
            or words(candidate) != words(original_nfc)):
        return original
    symbols = lambda text: ''.join(c for c in text if not c.isalnum()
                                   and not c.isspace() and c not in PUNCTUATION)
    if symbols(candidate) != symbols(original_nfc):
        return original
    protected = lambda text: re.findall(r'\d+(?:[.,:/-]\d+)+|[A-Za-z]+(?:[.+/#@:_-][A-Za-z0-9+]+)+', text.casefold())
    if protected(candidate) != protected(original_nfc):
        return original
    urls = lambda text: [m.rstrip('.,!?;:') for m in re.findall(r'(?:https?://|www\.)\S+', text, flags=re.I)]
    if urls(candidate) != urls(original_nfc):
        return original
    if re.search(r'[.,!?;:]{4,}', candidate):
        return original
    return candidate


def punctuate_vietnamese(text):
    """Small explicit fallback rules, not a semantic sentence-boundary model."""
    candidate = unicodedata.normalize('NFC', text).strip()
    candidate = re.sub(r'^(tuy nhiên|vì vậy|do đó|ngoài ra|bên cạnh đó|mặt khác|thứ nhất|thứ hai|cuối cùng)\s+',
                       r'\1, ', candidate, flags=re.I)
    match = re.search(r'\s+nhưng\s+', candidate, flags=re.I)
    if match and len(words(candidate[:match.start()])) >= 3 and len(words(candidate[match.end():])) >= 2:
        if candidate[:match.start()].rstrip()[-1:] not in ',.;:!?':
            candidate = candidate[:match.start()]+','+candidate[match.start():]
    tokens = words(candidate)
    question = (len(tokens) >= 4 and tokens[-1] in ('không','chưa')
                and (tokens[:2] in (['bạn','có'],['mình','có'],['cậu','có'],['anh','có'],['chị','có'])
                     or tokens[0] == 'có'))
    if question:
        candidate = re.sub(r'[.!?]*$', '?', candidate, count=1)
    elif candidate and candidate[-1] not in '.!?;:,' and not unfinished_vietnamese(candidate):
        candidate += '.'
    candidate = re.sub(r'^([^\w]*)(\w)', lambda m:m[1]+m[2].upper(), candidate, count=1)
    candidate = re.sub(r'([.!?]\s+)(\w)', lambda m:m[1]+m[2].upper(), candidate)
    return safe_punctuation(text, candidate)
