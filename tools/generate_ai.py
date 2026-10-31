"""Fills words_all.json with AI-written meanings + examples for every word that has no "ai" yet.
Usage:  ANTHROPIC_API_KEY=sk-... python3 tools/generate_ai.py [first_list] [last_list]
Safe to stop and re-run: finished words are skipped and the file is saved after every list."""
import json, os, sys, urllib.request
PATH = os.path.join(os.path.dirname(__file__), '..', 'words_all.json')
raw = json.load(open(PATH))
lo, hi = int(sys.argv[1]) if len(sys.argv) > 1 else 1, int(sys.argv[2]) if len(sys.argv) > 2 else 10**9
def ask(words):
    prompt = ('For each English word give exactly 2 different meanings (pos + a short definition in very simple, everyday English) and 3 short '
              'example sentences about daily life (home, school, work, friends, food, travel) using simple words. Reply with JSON only: {"word": {"meanings": [{"pos": "", "def": ""}, {"pos": "", "def": ""}], "examples": ["", "", ""]}}. Words: ' + ', '.join(words))
    req = urllib.request.Request('https://api.anthropic.com/v1/messages', json.dumps({'model': 'claude-sonnet-5-5', 'max_tokens': 4000,
        'messages': [{'role': 'user', 'content': prompt}]}).encode(), {'content-type': 'application/json',
        'x-api-key': os.environ['ANTHROPIC_API_KEY'], 'anthropic-version': '2023-06-01'})
    text = json.load(urllib.request.urlopen(req, timeout=120))['content'][0]['text']
    return json.loads(text[text.index('{'):text.rindex('}') + 1])
for k in sorted(raw, key=int):
    if not lo <= int(k) <= hi: continue
    todo = [w for w in raw[k]['words'] if isinstance(w, str)]
    if not todo: continue
    got = ask(todo)
    raw[k]['words'] = [({'word': w, 'ai': got[w]} if isinstance(w, str) and w in got else w) for w in raw[k]['words']]
    with open(PATH, 'w') as f:
        f.write('{\n' + ',\n'.join(f'  {json.dumps(n)}: ' + json.dumps(v, ensure_ascii=False) for n, v in raw.items()) + '\n}\n')
    print('list', k, 'done')
