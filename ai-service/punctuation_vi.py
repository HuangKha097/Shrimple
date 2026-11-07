"""Tiny local punctuation classifier. Only inserts marks; never generates words."""
import hashlib
import json
import os
import re
import threading
from pathlib import Path
import numpy as np
from speech_quality import safe_punctuation

FEATURE_DIM = 32768
MODEL_DIR = Path(os.getenv('VI_PUNCTUATION_MODEL_DIR','/models/punctuation-vi'))


def feature_indices(tokens,index):
    at=lambda offset: tokens[index+offset] if 0<=index+offset<len(tokens) else '<edge>'
    features=[f'w{o}={at(o)}' for o in (-2,-1,0,1,2)]
    features += ['left='+at(-1)+'|'+at(0),'right='+at(0)+'|'+at(1),
                 'next='+at(1)+'|'+at(2),'last='+str(index==len(tokens)-1)]
    return [int.from_bytes(hashlib.blake2b(f.encode(),digest_size=8).digest(),'little')%FEATURE_DIM for f in features]


def capitalize(text):
    text=re.sub(r'^([^\w]*)(\w)',lambda m:m[1]+m[2].upper(),text,count=1)
    return re.sub(r'([.!?]\s+)(\w)',lambda m:m[1]+m[2].upper(),text)


class Punctuator:
    def __init__(self,weights,bias,classes,threshold):
        self.weights,self.bias,self.classes,self.threshold=weights,bias,classes,threshold

    def restore(self,text):
        spans=list(re.finditer(r'\w+',text))
        tokens=[m[0].casefold() for m in spans]
        pieces=[];cursor=0
        for i,span in enumerate(spans):
            end=spans[i+1].start() if i+1<len(spans) else len(text)
            gap=text[span.end():end]
            pieces.append(text[cursor:span.end()])
            if not gap.strip() or (i==len(spans)-1 and gap.strip()=='.'):
                scores=self.weights[:,feature_indices(tokens,i)].sum(axis=1)+self.bias
                probabilities=np.exp(scores-scores.max());probabilities/=probabilities.sum()
                best=int(probabilities.argmax());mark=self.classes[best]
                if gap.strip()=='.' and mark in ('?','!') and probabilities[best]>=max(.65,self.threshold):
                    gap=gap.replace('.',mark,1)
                elif not gap.strip() and mark and probabilities[best]>=self.threshold:
                    pieces.append(mark)
            pieces.append(gap);cursor=end
        pieces.append(text[cursor:])
        return safe_punctuation(text,capitalize(''.join(pieces)))


_model=None
_attempted=False
_lock=threading.Lock()


def load_model(root=MODEL_DIR):
    metadata=json.loads((root/'model.json').read_text(encoding='utf-8'))
    blob=(root/'model.npz').read_bytes()
    if metadata.get('feature_version')!=1 or hashlib.sha256(blob).hexdigest()!=metadata['sha256']:
        raise ValueError('Punctuation model checksum/version mismatch')
    with np.load(root/'model.npz',allow_pickle=False) as data:
        weights=data['weights'];bias=data['bias'];classes=data['classes'].tolist()
    if (set(classes)-{'',',','.','?','!'} or weights.shape!=(len(classes),FEATURE_DIM)
            or bias.shape!=(len(classes),) or not np.isfinite(weights).all()
            or not np.isfinite(bias).all() or not 0<=metadata['threshold']<=1):
        raise ValueError('Invalid punctuation model')
    return Punctuator(weights,bias,classes,metadata['threshold'])


def restore(text):
    global _model,_attempted
    with _lock:
        if not _attempted:
            try:_model=load_model()
            except (OSError,ValueError,KeyError):_model=None
            _attempted=True
    return _model.restore(text) if _model else safe_punctuation(text,capitalize(text))


def status():
    restore('')
    return {'ready':_model is not None,'backend':'hashed_logistic' if _model else 'case_only'}
