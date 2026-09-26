/** "Brandi Gallegos" -> "BG" */
export function initials(name:string|null|undefined){return (name??'').split(/\s+/).filter(Boolean).map(part=>part[0]!.toUpperCase()).slice(0,2).join('');}
