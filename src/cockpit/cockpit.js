const delegate = require("delegates");
const bpu = require("../core/utils/blueprint");
const { Workflow } = require("../core/workflow/workflow");
const { Process } = require("../core/workflow/process");
const { Packages } = require("../core/workflow/packages");
const { Engine } = require("../engine/engine");
const { ProcessState } = require("../core/workflow/process_state");

class Cockpit {
  static get instance() {
    return Cockpit._instance;
  }

  static set instance(instance) {
    Cockpit._instance = instance;
  }

  constructor(persist_mode, persist_args, logger_level) {
    if (Cockpit.instance) {
      return Cockpit.instance;
    }

    this._engine = new Engine(persist_mode, persist_args, logger_level);
    delegate(this, "_engine")
      .method("fetchAvailableActivitiesForActor")
      .method("fetchDoneActivitiesForActor")
      .method("fetchAvailableActivityForProcess")
      .method("beginActivity")
      .method("commitActivity")
      .method("pushActivity")
      .method("createProcess")
      .method("createProcessByWorkflowName")
      .method("runProcess")
      .method("fetchProcess")
      .method("fetchProcessList")
      .method("fetchProcessStateHistory")
      .method("abortProcess")
      .method("saveWorkflow")
      .method("fetchWorkflow")
      .method("deleteWorkflow")
      .method("savePackage")
      .method("fetchPackage")
      .method("deletePackage")
      .method("addCustomSystemCategory");

    Cockpit.instance = this;
  }

  async fetchWorkflowsWithProcessStatusCount(filters) {
    const workflows_data = await Process.getPersist().getWorkflowWithProcesses(filters);
    return workflows_data.reduce((accum, workflow) => {
      const workflow_id = workflow.id;
      if (!accum[workflow_id]) {
        accum[workflow_id] = {
          workflow_name: workflow.name,
          workflow_description: workflow.description,
          workflow_version: workflow.version,
        };
      }

      if (workflow.state) {
        const process_status = workflow.state.status;
        if (accum[workflow_id][process_status]) {
          accum[workflow_id][process_status] += 1;
        } else {
          accum[workflow_id][process_status] = 1;
        }
      }
      return accum;
    }, {});
  }

  async getProcessStateHistory(process_id) {
    return await Process.getPersist().getStateHistoryByProcess(process_id);
  }

  async getWorkflows() {
    return await Workflow.getPersist().getAll();
  }

  async getWorkflowsForActor(actor_data) {
    const workflows_data = await Workflow.getPersist().getAll();
    return await this._filterForAllowedWorkflows(workflows_data, actor_data);
  }

  async runPendingProcess(process_id, actor_data) {
    const process = await Process.fetch(process_id);
    if (!process) {
      throw new Error("Process not found");
    }
    const result = await process.runPendingProcess(actor_data);
    return result;
  }

  async setProcessState(process_id, state_data) {
    let process = await Process.fetch(process_id);
    if (!process) {
      throw new Error("Process not found");
    }

    process = await process.setState(state_data);
    return process.state;
  }

  async getProcessState(stateId) {
    if (!stateId) {
      throw new Error("[getProcessState] Process Id not provided");
    }

    return await ProcessState.fetch(stateId);
  }

  async findProcessStatesByStepNumber(processId, stepNumber) {
    if (!processId) {
      throw new Error("[findProcessStatesByStepNumber] Process Id not provided");
    }

    if (!stepNumber) {
      throw new Error("[findProcessStatesByStepNumber] stepNumber not provided");
    }

    const result = await ProcessState.fetchByStepNumber(processId, stepNumber);
    return result;
  }

  async findProcessStatesByNodeId(processId, nodeId) {
    if (!processId) {
      throw new Error("[findProcessStatesByNodeId] Process Id not provided");
    }

    if (!nodeId) {
      throw new Error("[findProcessStatesByNodeId] NodeId not provided");
    }

    const result = await ProcessState.fetchByNodeId(processId, nodeId);
    return result;
  }

  async _filterForAllowedWorkflows(workflows_data, actor_data) {
    const allowed_workflows = [];
    for (let workflow_data of workflows_data) {
      const blueprint_spec = workflow_data.blueprint_spec;
      const custom_lisp = await Packages._fetchPackages(blueprint_spec.requirements, blueprint_spec.prepare);
      const allowed_start_nodes = bpu.getAllowedStartNodes(blueprint_spec, actor_data, {}, custom_lisp);
      if (allowed_start_nodes.length === 1) {
        allowed_workflows.push(workflow_data);
      }
    }
    return allowed_workflows;
  }
}

module.exports = {
  Cockpit: Cockpit,
};
