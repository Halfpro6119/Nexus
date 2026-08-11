export type LeadStatus="Discovered"|"Enriched"|"Contacted";
export interface Lead{id:string;business_name:string;website_url:string|null;phone:string|null;address:string|null;google_place_id:string;niche:string;location:string;status:LeadStatus;created_at:string}
export type CallQueueStatus="Not Called"|"Attempted"|"Connected"|"Follow Up"|"Do Not Call";
export interface CallQueueEntry{id:string;lead_id:string;website_url:string|null;maps_url:string;status:CallQueueStatus;notes:string;last_called_at:string|null;created_at:string;lead:Lead}
export interface DecisionMaker{name:string;title:string;email:string;source:string;phone?:string;linkedin?:string;confidence?:"High"|"Medium"}
export interface LeadEnrichment{id:string;lead_id:string;pagespeed_score:number;pagespeed_issues:string[];website_audit_notes:string;visual_design_flaws:string[];decision_makers:DecisionMaker[];value_proposition_angle:string;updated_at:string}
export interface EmailRecipient{lead:Lead;decisionMaker:DecisionMaker;enrichment:LeadEnrichment}
export type Sentiment="Interested"|"Objection"|"Unsubscribe"|"Meeting Request"|"Other";
export interface InboxDraft{id:string;lead_id:string;business_name:string;incoming_message:string;sentiment:Sentiment;proposed_draft:string;final_version?:string;status:"Pending"|"Approved"|"Sent";created_at:string}
export interface ApiResult<T>{data?:T;error?:string;demo?:boolean}
export type EmailProvider="gmail"|"microsoft"|"smtp";
export interface EmailAccount{id:string;provider:EmailProvider;email_address:string;is_active:boolean;created_at:string}
export interface BuilderArtifact{code:string;previewHtml:string;explanation:string}
export type WebsiteAuditCategory="Design"|"User experience"|"Mobile experience"|"Accessibility"|"Performance"|"Trust signals"|"Branding"|"Calls to action";
export interface WebsiteAuditScore{category:WebsiteAuditCategory;score:number;finding:string;evidence:string}
export interface WebsiteAuditImprovement{priority:"High"|"Medium"|"Low";title:string;problem:string;businessImpact:string;recommendation:string;evidence:string}
export interface WebsiteAuditReport{url:string;companyName:string;executiveSummary:string;overallScore:number;scores:WebsiteAuditScore[];improvements:WebsiteAuditImprovement[];strengths:string[];professionalReport:string;auditedAt:string;savedToGoogleSheets:boolean}
export interface ScraperProgress{timestamp:string;phase:"campaign"|"shard"|"merge"|"profile"|"database"|"complete"|"error";level:"info"|"success"|"warning"|"error";message:string;shard?:number;current?:number;total?:number}
export interface SearchAgentRecommendation{niche:string;location:string;score:number;reason:string;firstSearch:string;leadCount:number;websiteRate:number;phoneRate:number}
export interface SearchAgentQuestion{id:string;question:string;placeholder:string;defaultValue:string}
export interface SearchAgentMessage{id:string;role:"assistant"|"user";content:string;createdAt:string}
export interface SearchAgentReport{service:string;summary:string;recommendations:SearchAgentRecommendation[];bestNiche:string;bestLocation:string;bestSearch:string;terminal:ScraperProgress[];questions:SearchAgentQuestion[];context:{service:string;idealCustomer:string;locations:string;goal:string};messages:SearchAgentMessage[];awaitingReply:boolean;nextQuestion?:SearchAgentQuestion}
