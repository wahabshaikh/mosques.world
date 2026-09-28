const HOIST_STREAMED_METADATA = `(function(){var s='title,meta,link[rel="canonical"],link[rel="alternate"],link[rel="manifest"],link[rel="icon"],link[rel="apple-touch-icon"]';function hoist(){if(!document.body)return;var nodes=document.body.querySelectorAll(s);for(var i=0;i<nodes.length;i++)document.head.appendChild(nodes[i]);}hoist();new MutationObserver(hoist).observe(document.documentElement,{childList:true,subtree:true});})();`;

export function HoistMetadata() {
  return (
    <script dangerouslySetInnerHTML={{ __html: HOIST_STREAMED_METADATA }} />
  );
}
