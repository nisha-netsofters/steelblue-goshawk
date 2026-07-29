STAR FIX - MANUAL UPLOAD (Hostinger File Manager)
================================================

Local works. Live still 404 = files not updated on server.
Do NOT extract into public_html.

STEP A - Open File Manager
Go to folder that shows BOTH: nodejs  and  public_html
Then OPEN the nodejs folder.

STEP B - Upload these files one by one (Overwrite YES)

1) Folder: nodejs/
   Upload file from: 1_upload_to_nodejs_folder/app.js
   Replace existing app.js

2) Folder: nodejs/controllerV2/
   Upload file from: 2_upload_to_nodejs_controllerV2/saved_Candidates.js
   Replace existing saved_Candidates.js

3) Folder: nodejs/routes-V2/
   Upload BOTH files from: 3_upload_to_nodejs_routes-V2/
   - candidate.js (replace)
   - favoriteToggle.js (new file OK)

4) Folder: nodejs/tmp/
   Upload file from: 4_upload_to_nodejs_tmp/restart.txt
   Replace existing restart.txt
   (this restarts Node app)

STEP C - Wait 1 minute, then open in browser:
https://steelblue-goshawk-113691.hostingersite.com/api/candidate/toggle-favorite

SUCCESS if you see JSON with status ok
FAIL if you still see: Cannot GET ...

Then test star click on live candidate page.

WRONG places:
- public_html
- public_html/.builds
- extracting zip into wrong folder
