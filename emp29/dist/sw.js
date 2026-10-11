// EMP29 v2.1.0 – rebuilt on each release; never cache navigation.
importScripts("/vendor/source-a1a17b9d03ec/controller.sw.js");
addEventListener('fetch',e=>{if($scramjetController.shouldRoute(e))e.respondWith($scramjetController.route(e));});
