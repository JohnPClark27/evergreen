"""
fixture_all_modules.py - create / remove a published test PLAN for tests/browser/studies.mjs:
"ZZ All modules", with two studies:
  Study 1 "ZZ Every module": one of EVERY module type
  Study 2 "ZZ Short study":  hymn + prayer
Uses the service key from .env. Neutral placeholder text only ("Test note", "Test question").

  python tests/browser/fixture_all_modules.py make
  python tests/browser/fixture_all_modules.py clean
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'pipeline'))  # works from any folder
import supa  # noqa: E402

sb = supa.client()
if sys.argv[1] == 'make':
    hymns = {h['number']: h['id'] for h in sb.table('hymns').select('id,number').eq('status', 'published').execute().data}
    prayer = sb.table('prayers').select('id').eq('slug', 'the-grace').execute().data[0]['id']
    pid = sb.table('study_plans').insert({'title': 'ZZ All modules', 'description': 'test plan', 'status': 'published'}).execute().data[0]['id']
    studies = [
        ('ZZ Every module', [('hymn', {'hymn_id': hymns[19]}), ('scripture', {'book': 'PSA', 'chapter': 121, 'start': 1, 'end': 2}),
                             ('note', {'title': 'Test note', 'text': 'Test line one.\nTest line two.', 'read_aloud': True}),
                             ('quiz', {'title': 'Test quiz', 'read_aloud': False, 'questions': [{'q': 'Test question?', 'choices': ['One', 'Two', '', ''], 'answer': 1}]}),
                             ('finish-line', {'hymn_id': hymns[19], 'stanza': 1, 'lines': 2}), ('prayer', {'prayer_id': prayer}),
                             ('hymn', {'hymn_id': hymns[256]})]),
        ('ZZ Short study', [('hymn', {'hymn_id': hymns[256]}), ('prayer', {'prayer_id': prayer})]),
    ]
    for pos, (title, items) in enumerate(studies):
        sid = sb.table('plan_studies').insert({'plan_id': pid, 'position': pos, 'title': title}).execute().data[0]['id']
        sb.table('study_plan_items').insert([{'plan_id': pid, 'study_id': sid, 'position': i, 'module_type': t, 'config': c}
                                             for i, (t, c) in enumerate(items)]).execute()
    print('made', pid)
else:
    print('deleted', len(sb.table('study_plans').delete().like('title', 'ZZ %').execute().data))
