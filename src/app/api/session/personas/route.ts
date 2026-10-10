import {NextResponse} from 'next/server';
import {teamReps} from '@/server/repository';
import {personas} from '@/server/session';
export const runtime='nodejs';export const dynamic='force-dynamic';

// GET /api/session/personas (v3 decision 39, spec §6 Workspace chooser, §8, OA-27; task F1): the rep
// personas the workspace chooser offers next to Brandi (the manager, offered as the supplier
// workspace), in persona order, each with its role and team label. A rep marked inactive is left
// out (their session is refused anyway). Names and labels only: no contact details.
export function GET(){
  const stored=new Map(teamReps().map(r=>[r.id,r]));
  const reps=Object.entries(personas).flatMap(([id,p])=>{
    const rep=p.rep_role==='rep'&&p.rep_id?stored.get(p.rep_id):undefined;
    return rep&&rep.active&&rep.role==='rep'?[{id,name:rep.name,role:rep.role,team:rep.team}]:[];
  });
  return NextResponse.json({reps},{headers:{'Cache-Control':'no-store'}});
}
