CLIENT COMMENTS LIVE FIX
========================

Need BOTH:
1) Backend upload on steelblue-goshawk site
2) Frontend upload on peachpuff-snail site

BACKEND (steelblue File Manager -> nodejs folder)
------------------------------------------------
1) nodejs/controllerV2/
   - candidate.js (replace)
   - recruiterInternalComments.js (replace)

2) nodejs/services/
   - recruiterInternalCommentStages.js (NEW file - upload)

3) nodejs/tmp/
   - restart.txt (replace)

FRONTEND (peachpuff-snail File Manager -> public_html or site root)
------------------------------------------------------------------
Upload FRONTEND folder contents with Overwrite YES:
- index.html
- static/ (folder)

After upload, hard refresh client login page (Ctrl+Shift+R).
Look for "Recruiter Notes" on candidate card when comment has Visible to Client checked.
