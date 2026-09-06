import assert from 'node:assert/strict';

// Independent arithmetic for the ordinary 45-row fixture. Fail admission for a
// different input contract instead of importing the production normalizer.
export function fixtureReportRows(raw, calendar) {
  assert.deepEqual(calendar.workingDays, [1,2,3,4,5]);
  assert.deepEqual(calendar.holidays, []);
  const date = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const n=Date.parse(value+'T00:00:00Z');
    return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===value?n:null;
  };
  return raw.map(row => {
    const start=date(row.startDate), end=date(row.dueDate);
    let duration=row.duration??null;
    if(duration===null && row.durationExplicitlyCleared!==true) {
      // These untouched rows came from the same raw Jira baseline. Saved
      // explicit clears are a separate contract and remain null above.
      assert.ok(!row._original || (row._original.duration==null && row.startDate===row._original.startDate && row.dueDate===row._original.dueDate), `Unexpected null current edit: ${row.key}`);
      if(start!==null && end!==null && end>=start) {
        let workdays=0;
        for(let n=start;n<=end;n+=86400000)if(![0,6].includes(new Date(n).getUTCDay()))workdays++;
        duration=workdays>0?workdays:null;
      }
    } else if(duration!==null) {
      assert.ok(Number.isFinite(duration)&&duration>=0,`Unexpected current duration: ${row.key}`);
      // Fixture numeric inputs must be an explicit zero/capture or a saved
      // current edit. A differing raw import needs its own expected oracle.
      assert.ok(duration===0 || row.capturedDuration===true || (row._original && (row.duration!==row._original.duration || row.startDate!==row._original.startDate || row.dueDate!==row._original.dueDate)),`Unexpected raw numeric import: ${row.key}`);
    }
    return {key:row.key,summary:row.summary,startDate:row.startDate??null,dueDate:row.dueDate??null,duration};
  }).sort((a,b)=>a.key.localeCompare(b.key));
}
