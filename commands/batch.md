---
description: Plan several feature stories at once and run them unattended, one fresh session per story, until each is green
agent: conductor
---

Load the `workflow-rules` skill, then run the `workflow-batch` skill for this request.

The workflow was chosen explicitly: do not re-classify it. If a story clearly does not fit a batch (it needs a prototype, or it is a fix or a refactoring), say so and propose its own workflow.

Request:

$ARGUMENTS
