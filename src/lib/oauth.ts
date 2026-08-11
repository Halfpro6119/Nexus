import{createHmac,randomBytes,timingSafeEqual}from"crypto";
const secret=()=>process.env.OAUTH_STATE_SECRET??process.env.SUPABASE_SERVICE_ROLE_KEY??"local-development-only";
export function createOAuthState(provider:"gmail"|"microsoft"){const nonce=randomBytes(18).toString("hex"),payload=`${provider}.${nonce}`,signature=createHmac("sha256",secret()).update(payload).digest("hex");return{state:Buffer.from(`${payload}.${signature}`).toString("base64url"),nonce}}
export function verifyOAuthState(state:string,nonce:string,provider:"gmail"|"microsoft"){try{const[p,n,s]=Buffer.from(state,"base64url").toString().split(".");if(p!==provider||n!==nonce||!s)return false;const expected=createHmac("sha256",secret()).update(`${p}.${n}`).digest("hex");return timingSafeEqual(Buffer.from(s),Buffer.from(expected))}catch{return false}}
export function appUrl(){return(process.env.NEXT_PUBLIC_APP_URL??"http://localhost:3000").replace(/\/$/,"")}
