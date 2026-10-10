import {readdirSync,readFileSync} from 'node:fs';
import {join,posix,resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

// Agent tooling guard (plan T0, decisions 1-2): Notion is no longer the source of truth, so no
// agent or skill file may mention it, and the task loop must carry the claim rule from
// docs/plans/plan.md "Claiming work".

const ROOT=resolve(__dirname,'..');
const LOOP='.claude/skills/querent-task-loop/SKILL.md';

function agentFiles(){
  const agents=readdirSync(join(ROOT,'.claude/agents')).filter(name=>name.endsWith('.md')).map(name=>posix.join('.claude/agents',name));
  const skills=readdirSync(join(ROOT,'.claude/skills')).filter(name=>name.startsWith('querent-')).map(name=>posix.join('.claude/skills',name,'SKILL.md'));
  return ['AGENTS.md',...agents,...skills];
}

describe('agent tooling',()=>{
  it('covers the agent files and both querent skills',()=>{
    expect(agentFiles()).toEqual(expect.arrayContaining(['AGENTS.md','.claude/agents/implementer.md','.claude/agents/verifier.md',LOOP,'.claude/skills/querent-verify/SKILL.md']));
  });

  it.each(agentFiles())('%s does not mention Notion',file=>{
    expect(readFileSync(join(ROOT,file),'utf8')).not.toMatch(/notion/i);
  });

  it('task loop carries the claim rule',()=>{
    const loop=readFileSync(join(ROOT,LOOP),'utf8');
    for(const text of ['git worktree list','git branch -a','task/<task-id>-<slug>','docs/plans/plan.md','docs/plans/status.md'])expect(loop).toContain(text);
  });
});
