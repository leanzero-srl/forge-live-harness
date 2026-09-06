import fs from 'node:fs';import assert from 'node:assert/strict';import ts from 'typescript';
export function retentionParts(source){
 const ast=ts.createSourceFile('scenario.ts',source,ts.ScriptTarget.Latest,true);let branch;
 function visit(n){if(ts.isIfStatement(n)&&n.expression.getText(ast)==='retain'){assert.equal(branch,undefined);branch=n;}ts.forEachChild(n,visit);}visit(ast);assert(branch?.elseStatement);
 return {branch:branch.getText(ast),retained:branch.thenStatement.getText(ast),cleanup:branch.elseStatement.getText(ast)};
}
export function withoutRetention(source){const {branch,cleanup}=retentionParts(source);return source.replace("import {privateRetentionMode} from './private-retention-mode.mjs';\n",'').replace("\nconst retain=privateRetentionMode(process.env.LZ_PRIVATE_RETAIN_MODE);",'').replace("...(retain?{retentionMode:'retain'}:{}),",'').replace('  // Retention keeps the exact verified source, snapshot, model and report for subsequent inspection.\n','').replace(branch,cleanup.slice(1,-1).trimEnd().replace(/^\n/,'' )).replace('    // Mutations below','  // Mutations below');}
export const current=()=>fs.readFileSync('scenarios/lz-ppm/campaign-private-staged-report.spec.ts','utf8');
