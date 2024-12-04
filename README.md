[![banner](https://raw.githubusercontent.com/nevermined-io/assets/main/images/logo/banner_logo.png)](https://nevermined.io)

# Orchestrator Agent using Nevermined's Payments API (TypeScript)

> A TypeScript-based orchestrator agent demonstrating how to process tasks using Nevermined's Payments API. This agent orchestrates workflows involving multiple **steps** and **sub-agent tasks** in a structured and secure pipeline.

* * *

Related Projects
----------------

This project is part of a larger workflow that explores the interconnection between agents and how can they communicate and work together. Please, refer to these projects in order to have a full view of the whole process

1.  [Movie Orchestrator Agent](https://github.com/nevermined-io/movie-orchestrator-agent):
    
    *   Coordinates the entire workflow, ensuring smooth task execution across agents.
2.  [Movie Script Generator Agent](https://github.com/nevermined-io/movie-script-generator-agent):
    
    *   Generates movie scripts based on input ideas.
3.  [Character Extractor Agent](https://github.com/nevermined-io/character-extractor-agent):
    
    *   Extracts character descriptions from movie scripts for further processing.

4.  [Image Generator Agent](https://github.com/nevermined-io/image-generator-agent):
    
    *   Generates realistic character images based on their descriptions.

* * *

## Table of Contents
1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
   - [Prerequisites](#prerequisites)
   - [Installation](#installation)
3. [Environment Variables](#environment-variables)
4. [Architecture Overview](#architecture-overview)
   - [Plans and Agents](#plans-and-agents)
   - [Workflow and Steps](#workflow-and-steps)
5. [How to create your own complex agent](#how-to-create-your-own-complex-agent)
   - [1. Generating Steps](#1-generating-steps)
   - [2. Sub-Agent Task Management](#2-sub-agent-task-management)
   - [3. Validating Tasks and Completing Steps](#3-validating-tasks-and-completing-steps)
   - [4. Managing Balance and Payments](#4-managing-balance-and-payments)
   - [5. Handling Input and Output Data](#5-handling-input-and-output-data)
6. [License](#license)

---

## Introduction

The Orchestrator Agent leverages **Nevermined's Payments API** to enable structured workflows with clear payment and task execution flows. The Payments API allows agents to:

- **Manage payment plans**: Create tasks for agents under the same or different payment plans.
- **Handle balance checks**: Ensure sufficient balance in a plan and purchase additional credits when necessary.
- **Orchestrate workflows**: Assign tasks to agents, monitor their progress, and validate results through callbacks.

This project demonstrates a real-world implementation of these concepts, integrating multiple sub-agents:
- **Script Generator Agent** (same plan)
- **Character Extractor Agent** (same plan)
- **Image Generator Agent** (different plan)

---

## Getting Started

### Prerequisites
- **Node.js** (v14 or higher)
- **TypeScript** globally installed
- **Nevermined API Key**
- Sub-agent DIDs for specific tasks

### Installation
1. Clone the repository:
   ```
   git clone https://github.com/nevermined-io/movie-orchestrator-agent.git
   cd orchestrator-agent
   ```

2.  Install dependencies:
    
    ```
    npm install
    ```
    
3.  Configure environment variables: Copy `.env.example` to `.env` and populate it:
    
    ```
    NVM_API_KEY=your_nevermined_api_key
    NVM_ENVIRONMENT=testing # or staging or production
    THIS_PLAN_DID=your_plan_did
    IMAGE_GENERATOR_PLAN_DID=your_image_plan_did
    THIS_AGENT_DID=your_agent_did
    SCRIPT_GENERATOR_DID=your_script_did
    CHARACTER_EXTRACTOR_DID=your_character_extractor_did
    IMAGE_GENERATOR_DID=your_image_generator_did
    ```
    
4.  Build and run the project:
    
    ```
    npm run build
    npm start
    ```
    

* * *

Environment Variables
---------------------

| Variable | Description |
|-----------|-------------|
|`NVM_API_KEY`| Your Nevermined API Key |
|`NVM_ENVIRONMENT`| Environment (`testing`, `staging`, or `production`) |
|`THIS_PLAN_DID` | DID of the main subscription plan |
|`IMAGE_GENERATOR_PLAN_DID` | DID of the plan for image generation |
|`THIS_AGENT_DID` | DID of the orchestrator agent |
|`SCRIPT_GENERATOR_DID` | DID of the script generator sub-agent |
|`CHARACTER_EXTRACTOR_DID` | DID of the character extractor sub-agent |
|`IMAGE_GENERATOR_DID` | DID of the image generator sub-agent |

* * *

Architecture Overview
---------------------

### Plans and Agents

In **Nevermined**, a **Plan (PLAN\_DID)** represents a subscription that allows agents to execute tasks. Plans have credits that are consumed as tasks are executed.

*   **Agents (AGENT\_DID)** are entities that execute specific tasks. These agents may:
    *   Be **under the same plan**, sharing the plan's balance (e.g., Script Generator and Character Extractor).
    *   Be **under a different plan**, or even belong to different builders, requiring separate permissions and credits (e.g., Image Generator).

**Example:**

*   **Plan A**:
    *   Includes the **Orchestrator Agent** and its sub-agents:
        *   Script Generator Agent
        *   Character Extractor Agent
*   **Plan B**:
    *   Includes an external **Image Generator Agent**.

#### Relationship Diagram:

```css
[Plan A: THIS_PLAN_DID] ----------- [Orchestrator Agent]
                                    |-- [Script Generator Agent]
                                    |-- [Character Extractor Agent]

[Plan B: IMAGE_GENERATOR_PLAN_DID] -- [Image Generator Agent]
```

### Workflow and Steps

1.  **Init Step**:
    
    *   Always the first step in a workflow.
    *   Creates subsequent steps (e.g., `generateScript`, `extractCharacters`, `generateImagesForCharacters`).
2.  **Step Lifecycle**:
    
    *   **Balance Check**: Ensure the plan has sufficient credits.
    *   **Sub-Task Creation**:
        *   Retrieve **access permissions** for the sub-agent.
        *   Create a task for the sub-agent with specific input data.
    *   **Task Validation**:
        *   Validate the task status via logs.
        *   Mark the task as completed only when all associated sub-tasks are finished.

### In this example:
1.  **Init Step**:
    *   Defines and schedules subsequent steps.
2.  **Generate Script**:
    *   Uses Script Generator to create a story.
3.  **Extract Characters**:
    *   Uses Character Extractor to derive characters from the story.
4.  **Generate Images for Characters**:
    *   Assigns tasks to Image Generator for creating character images.


#### Workflow Diagram:

```css
[Init Step] --> [generateScript] --> [extractCharacters] --> [generateImagesForCharacters]
```

* * *

How to create your own complex agent
--------

### 1\. Generating Steps

The `handleInitStep` function initializes the workflow by defining the subsequent steps:

```typescript
export async function handleInitStep(step: any, payments: any) {
  const scriptStepId = generateStepId();
  const characterStepId = generateStepId();
  const imageStepId = generateStepId();

  const steps = [
    { step_id: scriptStepId, task_id: step.task_id, name: "generateScript", predecessor: step.step_id },
    { step_id: characterStepId, task_id: step.task_id, name: "extractCharacters", predecessor: scriptStepId },
    { step_id: imageStepId, task_id: step.task_id, name: "generateImagesForCharacters", predecessor: characterStepId },
  ];

  await payments.query.createSteps(step.did, step.task_id, { steps });
}
```

All steps are interlinked using `predecessor`, maintaining the execution order.

* * *

### 2\. Sub-Agent Task Management

Within each step, sub-tasks are created for specific agents:

```typescript
export async function handleStepWithAgent(
  step: any,
  agentDid: string,
  agentName: string,
  planDid: string,
  payments: any
) {
  const hasBalance = await ensureSufficientBalance(planDid, step, payments);
  if (!hasBalance) return;

  const accessConfig = await payments.getServiceAccessConfig(agentDid);
  const taskData = { query: step.input_query, name: step.name };

  await payments.query.createTask(
    agentDid,
    taskData,
    accessConfig,
    async (data) => {
      const taskLog = JSON.parse(data);

      if (taskLog.task_status === "Completed") {
        await validateGenericTask(
          taskLog.task_id,
          agentDid,
          accessConfig,
          step,
          payments
        );
      }
    }
  );
}
```

* * *

### 3\. Validating Tasks and Completing Steps

When a step involves multiple tasks (e.g., generating images), all tasks must complete successfully before marking the step as completed:

```typescript
export async function handleImageGenerationForCharacters(step: any, payments: any) {
  const characters = JSON.parse(step.input_artifacts);
  const tasks = characters.map((character) =>
    queryAgentWithPrompt(step, generateTextToImagePrompt(character), "Image Generator", payments)
  );

  await Promise.all(tasks);

  await payments.query.updateStep(step.did, {
    ...step,
    step_status: "Completed",
    output: "All image generation tasks completed successfully.",
  });
}
```

* * *

### 4\. Managing Balance and Payments

The orchestrator ensures sufficient balance before executing tasks:

```typescript
export async function ensureSufficientBalance(planDid: string, step: any, payments: any): Promise<boolean> {
  const balance = await payments.getPlanBalance(planDid);
  if (balance < 1) {
    const orderResult = await payments.orderPlan(planDid);
    if (!orderResult.success) {
      await payments.query.updateStep(step.did, {
        ...step,
        step_status: "Failed",
        output: "Insufficient balance and failed to order credits.",
      });
      return false;
    }
  }
  return true;
}
```

* * *

### 5\. Handling Input and Output Data

**Input and Output Parameters**:

*   `step.input_query`: Primary input for a step.
*   `step.output`: Standard output of the step.
*   `step.input_artifacts`: Artifacts passed from the previous step.
*   `step.output_artifacts`: Artifacts generated by the current step.

**Flow**:

*   Outputs (`output`/`output_artifacts`) from one step are automatically used as inputs (`input_query`/`input_artifacts`) for the subsequent step.

**Example**:

*   **Script Generator Step** outputs a script (`output`).
*   **Character Extractor Step** uses this script as its `input_query`.


* * *

License
-------

```
Copyright 2024 Nevermined AG

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```