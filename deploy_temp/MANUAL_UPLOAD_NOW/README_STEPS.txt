HOSTINGER MANUAL UPLOAD
=======================
Open File Manager -> folder that has BOTH public_html AND nodejs
Then open nodejs folder.

UPLOAD IN THIS ORDER (Overwrite = YES):

1) Into: nodejs/
   File: 1_UPLOAD_INTO_nodejs_ROOT\app.js

2) Into: nodejs/controllerV2/
   Files from 2_UPLOAD_INTO_nodejs_controllerV2\
   - candidate.js
   - user.js
   - landingpage.js
   - saved_Candidates.js

3) Into: nodejs/middleware/whatsappMSG/
   File: 3_UPLOAD_INTO_nodejs_middleware_whatsappMSG\welcomeMessage.js

4) Into: nodejs/models-v2/
   Files from 4_UPLOAD_INTO_nodejs_models-v2\
   - candidates_Mongoose.js
   - savedCandidates_Mongoose.js

5) Into: nodejs/routes-V2/
   Files from 5_UPLOAD_INTO_nodejs_routes-V2\
   - candidate.js
   - favoriteToggle.js

6) Into: nodejs/services/
   File: 6_UPLOAD_INTO_nodejs_services\candidateQuickFilter.js

7) Into: nodejs/tmp/
   File: 7_UPLOAD_INTO_nodejs_tmp\restart.txt
   (LAST step - restarts Node)

WAIT 60 seconds, then open:
https://steelblue-goshawk-113691.hostingersite.com/api/candidate/toggle-favorite-check

MUST show JSON status ok. If still 404, app.js went to wrong folder.
