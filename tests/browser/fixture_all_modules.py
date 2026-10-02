"""
fixture_all_modules.py - create / remove a published test plan that uses EVERY module type
("ZZ All modules"), for tests/browser/studies.mjs. Uses the service key from admin/.env.
Neutral placeholder text only ("Test note", "Test question").

  python tests/browser/fixture_all_modules.py make
  python tests/browser/fixture_all_modules.py clean
"""
import sys; sys.path.insert(0,'pipeline'); import supa
sb=supa.client()
if sys.argv[1]=='make':
    hymns={h['number']:h['id'] for h in sb.table('hymns').select('id,number').eq('status','published').execute().data}
    prayer=sb.table('prayers').select('id').eq('slug','the-grace').execute().data[0]['id']
    pid=sb.table('study_plans').insert({'title':'ZZ All modules','description':'test plan','status':'published'}).execute().data[0]['id']
    items=[('hymn',{'hymn_id':hymns[19]}),('scripture',{'book':'PSA','chapter':121,'start':1,'end':2}),
           ('note',{'title':'Test note','text':'Test line one.\nTest line two.','read_aloud':True}),
           ('quiz',{'title':'Test quiz','read_aloud':False,'questions':[{'q':'Test question?','choices':['One','Two','',''],'answer':1}]}),
           ('finish-line',{'hymn_id':hymns[19],'stanza':1,'lines':2}),('prayer',{'prayer_id':prayer}),('hymn',{'hymn_id':hymns[256]})]
    sb.table('study_plan_items').insert([{'plan_id':pid,'position':i,'module_type':t,'config':c} for i,(t,c) in enumerate(items)]).execute()
    print('made', pid)
else:
    print('deleted', len(sb.table('study_plans').delete().like('title','ZZ %').execute().data))
