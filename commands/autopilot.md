---
description: Start the autopilot workflow to build a new project from a spec in the repository, with gates only up front and at delivery
agent: conductor
---

Load the `workflow-rules` skill, then run the `workflow-autopilot` skill for this request.

The workflow was chosen explicitly: do not re-classify it. If the request clearly does not fit, say so and propose the right workflow.

Request:

$ARGUMENTS
