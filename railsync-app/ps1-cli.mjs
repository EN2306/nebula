import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {FILES,loadDataset,solve,exportsFor} from './ps1.mjs';
const base=path.dirname(fileURLToPath(import.meta.url));
const input=path.resolve(process.argv[2]||path.join(base,'ps1-reference','01_data'));
const output=path.resolve(process.argv[3]||path.join(base,'ps1-results'));
const data=loadDataset(Object.fromEntries(FILES.map(f=>[f,readFileSync(path.join(input,f),'utf8')])));
mkdirSync(output,{recursive:true});const reports={};
for(const scenario of ['A','B','C']){
 const result=solve(data,scenario);reports[scenario]=result.report;
 if(result.report.feasible){const target=path.join(output,scenario);mkdirSync(target,{recursive:true});for(const [name,content] of Object.entries(exportsFor(result)))writeFileSync(path.join(target,name),content);}
 else process.exitCode=1;
 console.log(`${scenario}: ${result.report.complete_activities}/${data.activities.length} complete; ${result.report.hard_violations.length} internal violations; penalty ${result.report.soft_scores.objective_score??'not feasible'}`);
}
writeFileSync(path.join(output,'INTERNAL_VALIDATION.json'),JSON.stringify(reports,null,2));
console.log('Independent RailSync checks only; official validator agreement has not been established.');
