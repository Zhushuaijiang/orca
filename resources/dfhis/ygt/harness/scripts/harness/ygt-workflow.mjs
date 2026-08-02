#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createReleaseState,
  executeReleaseState,
  loadReleaseState,
  prepareReleaseResume,
  releaseStatePath,
  saveReleaseState,
} from './ygt-workflow-release-state.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

bootstrapLocalPowerShellEnv();
bootstrapCompanyEnvironmentReference();

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_JENKINS_POLL_MS = 2000;
const DEFAULT_DIAGNOSE_TAIL = 200;

const frontendProfileScripts = {
  quick: ['typecheck', 'test'],
  standard: ['typecheck', 'test', 'build'],
  full: ['typecheck', 'test', 'build', 'test:e2e', 'e2e'],
};

const backendProfileGoals = {
  quick: ['test'],
  standard: ['test'],
  full: ['test', 'package'],
};

const superpowerSkillCatalog = {
  'using-superpowers': {
    purpose: 'check applicable skills before acting',
    triggers: ['skill', 'superpower', 'workflow', 'harness'],
  },
  brainstorming: {
    purpose: 'turn new or ambiguous feature ideas into an approved design before implementation',
    triggers: ['需求', '新增', '功能', '设计', '优化', '改造', 'feature', 'build', 'create', 'design'],
  },
  'systematic-debugging': {
    purpose: 'investigate root cause before fixing bugs, failures, and unexpected behavior',
    triggers: ['bug', 'fix', '报错', '错误', '失败', '异常', '不对', '不完整', '缺失', '没有', '没出来', '不显示', 'crash', 'fail', 'wrong', 'broken'],
  },
  'test-driven-development': {
    purpose: 'drive implementation with red-green-refactor when a code behavior change is needed',
    triggers: ['test', '测试', '用例', '回归', 'tdd'],
  },
  'dispatching-parallel-agents': {
    purpose: 'split independent project/page/subsystem work across parallel agents',
    triggers: ['所有', '全部', '每个', '多项目', '并行', 'agents', 'agent', 'parallel', 'all pages', 'all projects'],
  },
  'subagent-driven-development': {
    purpose: 'execute an approved implementation plan with bounded subagent tasks and reviews',
    triggers: ['计划', '分工', '执行计划', 'subagent', '多 agent', '多agent'],
  },
  'using-git-worktrees': {
    purpose: 'isolate parallel branches and avoid conflicting edits',
    triggers: ['worktree', '并行', '分支', '隔离'],
  },
  'requesting-code-review': {
    purpose: 'review code changes for bugs and missing tests before release',
    triggers: ['review', '审核', '检查代码', '代码审查'],
  },
  'verification-before-completion': {
    purpose: 'require fresh evidence before claiming completion, committing, or pushing',
    triggers: ['完成', '提交', '推送', '部署', 'jenkins', '上线', 'commit', 'push', 'deploy', 'done'],
  },
  'finishing-a-development-branch': {
    purpose: 'finish a branch with verification, commit, push, and release decisions',
    triggers: ['提交', '推送', '合并', '发布', 'commit', 'push', 'release', 'merge'],
  },
  'writing-skills': {
    purpose: 'create or update reusable project skills',
    triggers: ['技能', 'skill', 'superpowers', '封装成技能'],
  },
};

const projects = {
  main: {
    name: 'df-ygt-main',
    repoDir: repoRoot,
    frontendDir: resolve(repoRoot, 'frontend', 'df-web-ygt-main'),
    backendDir: resolve(repoRoot, 'backend'),
    localBackendPort: 8085,
    jenkinsJob: 'df-web-ygt-main-prod',
    k8sNamespace: 'prod',
    k8sDeployment: 'df-web-ygt-main',
    k8sAppLabel: 'df-web-ygt-main',
    prodUrl: 'http://192.168.199.41:8001/',
    loginUrl: 'http://192.168.199.41:8001/login',
    smokeUrls: [
      'http://192.168.199.41:8001/',
      'http://192.168.199.41:8001/login',
    ],
  },
  base: {
    name: 'df-ygt-biz-base',
    repoDir: resolve(repoRoot, '..', 'df-ygt-biz-base'),
    backendDir: resolve(repoRoot, '..', 'df-ygt-biz-base', 'backend'),
    frontendDir: resolve(repoRoot, '..', 'df-ygt-biz-base', 'frontend', 'df-web-ygt-biz-base'),
    jenkinsJob: 'df-ygt-biz-base-prod',
    k8sNamespace: 'prod',
    k8sDeployment: 'df-ygt-biz-base',
    k8sAppLabel: 'df-ygt-biz-base',
    prodUrl: 'http://192.168.199.41:9001/swagger-ui/index.html',
    smokeUrls: ['http://192.168.199.41:9001/swagger-ui/index.html'],
  },
  huanzhe360: {
    name: 'df-ygt-biz-huanzhe360',
    repoDir: resolve(repoRoot, '..', 'df-ygt-biz-huanzhe360'),
    backendDir: resolve(repoRoot, '..', 'df-ygt-biz-huanzhe360', 'backend'),
    frontendDir: resolve(repoRoot, '..', 'df-ygt-biz-huanzhe360', 'frontend', 'df-web-ygt-biz-huanzhe360'),
    jenkinsJob: 'df-ygt-biz-huanzhe360-prod',
    k8sNamespace: 'prod',
    k8sDeployment: 'df-ygt-biz-huanzhe360',
    k8sAppLabel: 'df-ygt-biz-huanzhe360',
    prodUrl: 'http://192.168.199.41:9004/swagger-ui/index.html',
    smokeUrls: ['http://192.168.199.41:9004/swagger-ui/index.html'],
  },
  zhusuoyin: {
    name: 'df-ygt-biz-zhusuoyin',
    repoDir: resolve(repoRoot, '..', 'df-ygt-biz-zhusuoyin'),
    backendDir: resolve(repoRoot, '..', 'df-ygt-biz-zhusuoyin', 'backend'),
    frontendDir: resolve(repoRoot, '..', 'df-ygt-biz-zhusuoyin', 'frontend', 'df-web-ygt-biz-zhusuoyin'),
    jenkinsJob: 'df-ygt-biz-zhusuoyin-prod',
    k8sNamespace: 'prod',
    k8sDeployment: 'df-ygt-biz-zhusuoyin',
    k8sAppLabel: 'df-ygt-biz-zhusuoyin',
    nodePortUrl: 'http://192.168.199.41:9002/actuator/health',
    smokeUrls: ['http://192.168.199.41:9002/actuator/health'],
  },
  shujumx: {
    name: 'df-ygt-biz-shujumx',
    repoDir: resolve(repoRoot, '..', 'df-ygt-biz-shujumx'),
    backendDir: resolve(repoRoot, '..', 'df-ygt-biz-shujumx', 'backend'),
    frontendDir: resolve(repoRoot, '..', 'df-ygt-biz-shujumx', 'frontend', 'df-web-ygt-biz-shujumx'),
    jenkinsJob: 'df-ygt-biz-shujumx-prod',
    k8sNamespace: 'prod',
    k8sDeployment: 'df-ygt-biz-shujumx',
    k8sAppLabel: 'df-ygt-biz-shujumx',
    prodUrl: 'http://192.168.199.41:9003/swagger-ui/index.html',
    smokeUrls: ['http://192.168.199.41:9003/swagger-ui/index.html'],
  },
};

const envDefaults = {
  YGT_MAIN_URL: 'http://192.168.199.41:8001',
  YGT_GATEWAY_URL: 'http://192.168.199.41:9000/console',
  YGT_NACOS_URL: 'http://192.168.199.42:8848',
  YGT_NACOS_CONSOLE_URL: 'http://192.168.199.42:18848',
  YGT_JENKINS_URL: 'http://192.168.199.42:8082',
  YGT_DEPLOY_HOST: '192.168.199.42',
  YGT_DEPLOY_USER: 'root',
  YGT_K8S_NAMESPACE: 'prod',
  YGT_DORIS_HOST: '192.168.1.10',
  YGT_DORIS_PORT: '9030',
  YGT_DORIS_DATABASE: 'df_ygt',
};

const defaultCommitPathspec = [
  '.',
  ':(exclude)backend/logs/**',
  ':(exclude)logs/**',
  ':(exclude)**/*.log',
  ':(exclude)**/*.log.*',
  ':(exclude)**/*.gz',
  ':(exclude).DS_Store',
  ':(exclude)**/.DS_Store',
  ':(exclude).ygt-runs/**',
  ':(exclude)scripts/harness/ygt-env.local.ps1',
  ':(exclude)scripts/harness/ygt-env.*.local.ps1',
  ':(exclude)scripts/harness/ygt-env.*.secret.ps1',
  ':(exclude)scripts/harness/ygt-env.*.private.ps1',
];

const args = parseArgs(process.argv.slice(2));
const command = args._[0] ?? 'help';

try {
  await main(command, args);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

async function main(action, options) {
  const normalizedAction = normalizeCommand(action);
  if (['help', '-h', '--help'].includes(normalizedAction)) {
    printHelp();
    return;
  }

  const projectName = options.project ?? options.p ?? 'main';
  const project = normalizedAction === 'intake' && projectName === 'auto'
    ? getProject('main')
    : getProject(projectName);

  switch (normalizedAction) {
    case 'status':
      await status(project);
      break;
    case 'impact':
      await impact(project, options);
      break;
    case 'doctor':
      await doctor(project, options);
      break;
    case 'selftest':
      await selftest(project, options);
      break;
    case 'intake':
      await intake(project, options);
      break;
    case 'verify':
      await verify(project, options);
      break;
    case 'review':
      await review(project, options);
      break;
    case 'claim':
      await claim(project, options);
      break;
    case 'commit':
      await commit(project, options);
      break;
    case 'push':
      await push(project);
      break;
    case 'jenkins':
      await triggerAndWaitJenkins(project, options);
      break;
    case 'rollout':
      await rollout(project, options);
      break;
    case 'diagnose':
      await diagnose(project, options);
      break;
    case 'smoke':
      await smoke(project, options);
      break;
    case 'report':
      await report(project, options);
      break;
    case 'release':
      await release(project, options);
      break;
    case 'full':
      await full(project, options);
      break;
    case 'resume':
      await resumeRelease(project, options);
      break;
    case 'env':
      printEnv(project);
      break;
    default:
      throw new Error(`Unknown command: ${action}. Run "node scripts/harness/ygt-workflow.mjs help".`);
  }
}

async function full(project, options) {
  await durableRelease(project, options, 'full');
}

async function release(project, options) {
  await durableRelease(project, options, 'release');
}

async function resumeRelease(project, options) {
  if (!options.stateFile && !options.taskId && !options.task) {
    throw new Error('Resume requires --state-file or --task-id.');
  }
  await durableRelease(project, options, 'resume');
}

async function durableRelease(project, options, requestedAction) {
  const branch = (await capture('git', ['branch', '--show-current'], { cwd: project.repoDir })).trim();
  const taskId = sanitizeTaskId(options.taskId ?? options.task ?? `ygt-${Date.now()}`);
  const filePath = releaseStatePath(project.repoDir, taskId, options.stateFile);
  const resumed = requestedAction === 'resume';
  const loaded = resumed ? await loadReleaseState(filePath) : null;
  const action = loaded?.action ?? requestedAction;
  const stages = releaseStages(action, options);
  const state = loaded ?? createReleaseState({
    action,
    project: project.name,
    repoDir: project.repoDir,
    branch,
    taskId,
    stages,
  });
  if (loaded) {
    prepareReleaseResume(state, { project: project.name, repoDir: project.repoDir, branch });
  }
  const context = {
    project,
    options: { ...options, taskId: state.runId },
    state,
    statePath: filePath,
    persist: () => saveReleaseState(filePath, state),
  };
  await context.persist();
  try {
    await executeReleaseState(context, {
      runStage: runReleaseStage,
      rollback: (releaseContext, cause) => rollbackRelease(releaseContext, cause),
    });
    state.status = 'passed';
    state.completedAt = Date.now();
    state.error = null;
    await context.persist();
    ok(`${action === 'full' ? 'Full' : 'Release'} workflow completed. State: ${filePath}`);
  } catch (error) {
    state.status = 'failed';
    state.completedAt = Date.now();
    state.error = error instanceof Error ? error.message : String(error);
    await context.persist();
    throw error;
  }
}

function releaseStages(action, options) {
  const stages = action === 'full'
    ? ['status', 'impact', 'verify', 'review']
    : ['impact', 'review'];
  if (!options.noCommit) {stages.push('commit', 'push');}
  if (!options.skipDoctor) {stages.push('doctor');}
  stages.push('jenkins');
  if (!options.skipRollout) {stages.push('rollout');}
  stages.push('smoke');
  if (options.report || options.taskId || options.task) {stages.push('report');}
  return stages;
}

async function runReleaseStage(name, context) {
  const { project, options } = context;
  if (name === 'status') {return status(project);}
  if (name === 'impact') {return impact(project, options);}
  if (name === 'verify') {return verify(project, options);}
  if (name === 'review') {return review(project, options);}
  if (name === 'commit') {return commit(project, options);}
  if (name === 'push') {return push(project);}
  if (name === 'doctor') {return doctor(project, options);}
  if (name === 'jenkins') {return triggerAndWaitJenkins(project, { ...options, releaseContext: context });}
  if (name === 'rollout') {return rollout(project, options);}
  if (name === 'smoke') {return smoke(project, options);}
  if (name === 'report') {return report(project, options);}
  throw new Error(`Unknown release stage: ${name}`);
}

async function rollbackRelease(context, cause) {
  const command = context.options.rollbackCommand ?? env('YGT_ROLLBACK_COMMAND', false);
  if (!command) {return false;}
  section(`Rollback: ${context.project.name}`);
  log(`Triggering configured rollback after: ${cause instanceof Error ? cause.message : cause}`);
  const via = context.options.via ?? env('YGT_ROLLOUT_VIA', false) ?? 'ssh';
  if (via === 'jenkins') {
    await runJenkinsScript(command);
    return true;
  }
  if (via !== 'ssh') {throw new Error(`Unknown rollback transport: ${via}`);}
  const target = `${env('YGT_DEPLOY_USER')}@${env('YGT_DEPLOY_HOST')}`;
  await run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', target, command], {
    timeoutMs: 5 * 60 * 1000,
  });
  return true;
}

async function status(project) {
  section(`Git status: ${project.name}`);
  await run('git', ['status', '--short', '--branch'], { cwd: project.repoDir });
  await run('git', ['log', '--oneline', '-5'], { cwd: project.repoDir });
}

async function impact(project, options) {
  const result = await getImpact(project);
  if (options.json) {
    printJson(result);
    return;
  }
  section(`Impact analysis: ${project.name}`);
  log(`Files: ${result.files.length}`);
  log(`Areas: ${result.areas.length ? result.areas.join(', ') : 'none'}`);
  log(`Verification hint: ${result.verifyHint}`);
  if (result.risks.length) {
    log(`Risks: ${result.risks.join(', ')}`);
  }
  for (const file of result.files) {
    log(`${file.status.padEnd(3)} ${file.path} [${file.area}]`);
  }
}

async function doctor(project, options) {
  const result = await getDoctor(project, options);
  if (options.json) {
    printJson(result);
    return;
  }
  section(`Doctor: ${project.name}`);
  for (const check of result.checks) {
    log(`${check.ok ? 'OK' : 'WARN'} ${check.name}: ${check.message}`);
  }
}

async function selftest(project, options) {
  const result = await getSelftest(project, options);
  if (options.json) {
    printJson(result);
    return;
  }
  section(`Harness selftest: ${project.name}`);
  for (const checkItem of result.checks) {
    log(`${checkItem.ok ? 'OK' : 'FAIL'} ${checkItem.name}: ${checkItem.message}`);
  }
  if (!result.ok) {
    throw new Error('Harness selftest failed.');
  }
  ok('Harness selftest passed.');
}

async function intake(project, options) {
  const request = options.request ?? options.r ?? options._.slice(1).join(' ');
  if (!request) {
    throw new Error('Intake requires --request "一句话需求或问题".');
  }
  const result = buildIntakePlan(request, options.project ?? options.p);
  if (options.json) {
    printJson(result);
    return;
  }
  section('YGT superpowers intake');
  log(`Request: ${result.request}`);
  log(`Projects: ${result.projects.join(', ')}`);
  log(`Primary skill: ${result.primarySkill}`);
  log(`Skills: ${result.skills.join(', ')}`);
  log('Commands:');
  for (const command of result.commands) {
    log(`  ${command}`);
  }
  if (result.notes.length) {
    log('Notes:');
    for (const note of result.notes) {
      log(`  - ${note}`);
    }
  }
}

function buildIntakePlan(request, explicitProject) {
  const normalized = request.toLowerCase();
  const projectsForRequest = inferProjects(request, explicitProject);
  const skills = selectSuperpowerSkills(request);
  const primarySkill = choosePrimarySkill(skills);
  const commandProject = projectsForRequest[0] ?? 'main';
  const workflow = inferWorkflow(request, skills);
  const standards = inferStandards(request, projectsForRequest);
  const profile = normalized.includes('完整') || normalized.includes('full') ? 'full' : 'standard';
  const commands = [
    `node scripts/harness/ygt-workflow.mjs impact --project ${commandProject} --json`,
  ];
  if (workflow === 'debug') {
    commands.push(`node scripts/harness/ygt-workflow.mjs diagnose --project ${commandProject} --via jenkins --tail 300 --json`);
  }
  commands.push(`node scripts/harness/ygt-workflow.mjs doctor --project ${commandProject} --json`);
  commands.push(`node scripts/harness/ygt-workflow.mjs verify --project ${commandProject} --profile ${profile} --changed-only`);
  commands.push(`node scripts/harness/ygt-workflow.mjs review --project ${commandProject} --json`);
  commands.push(`node scripts/harness/ygt-workflow.mjs report --project ${commandProject} --task-id <task-id>`);

  const notes = [];
  if (projectsForRequest.length > 1 || skills.includes('dispatching-parallel-agents')) {
    notes.push('Use .ygt-task.yml plus claim for multi-agent ownership before implementation.');
    notes.push('Give shared files such as package.json, lockfiles, global styles, and harness files to the integrator only.');
  }
  if (skills.includes('brainstorming')) {
    notes.push('For new or ambiguous behavior, create/approve a short design before implementation.');
  }
  if (skills.includes('systematic-debugging')) {
    notes.push('For bugs, collect evidence and root cause before changing code.');
  }
  if (standards.length) {
    notes.push('Read the returned standards before code edits; code and documentation must stay consistent.');
  }

  return {
    request,
    projects: projectsForRequest,
    primarySkill,
    skills,
    workflow,
    standards,
    commands,
    notes,
    catalog: Object.fromEntries(skills.map((name) => [name, superpowerSkillCatalog[name]?.purpose])),
  };
}

function inferStandards(request, projectsForRequest) {
  const text = request.toLowerCase();
  const standards = [
    {
      category: 'project-ai-guide',
      requiredWhen: 'all YGT tasks',
      paths: [
        'docs/03-AI协作指南.md',
        'docs/04-YGT工作流Harness.md',
      ],
    },
  ];

  const frontendRequested = /(前端|页面|样式|布局|按钮|查询|弹窗|dx|devextreme|ui|css|菜单|子应用|微前端|layout|style|popup|modal|table|form)/i.test(request)
    || projectsForRequest.some((project) => ['main', 'base', 'shujumx', 'zhusuoyin', 'huanzhe360'].includes(project));
  const backendRequested = /(后端|接口|数据库|sql|doris|菜单接口|jenkins|k8s|服务|权限|认证|租户|controller|service|repository|entity|dto|api)/i.test(request);
  const layoutRequested = /(布局|样式|间距|查询条件|按钮|弹窗|表格|dx-tree|dx|devextreme|页面|ui|css|style|layout|popup|modal|toolbar|search)/i.test(request);

  if (frontendRequested) {
    standards.push({
      category: 'frontend-development-guide',
      requiredWhen: 'frontend, shell, micro-frontend, DevExtreme, permission, route, or UI work',
      paths: [
        'docs/前端开发指南/README.md',
        'docs/前端开发指南/06-DevExtreme集成.md',
        'docs/前端开发指南/07-编码规范与测试.md',
        'docs/前端开发指南/08-布局系统.md',
      ],
    });
  }

  if (layoutRequested) {
    standards.push({
      category: 'df-web-base-layout-constraints',
      requiredWhen: 'layout, spacing, search bar, action button, panel, table shell, popup, or page consistency work',
      paths: [
        '../../df-base/df-web-base/packages/ui/src/layouts/README.md',
        '../../df-base/df-web-base/packages/ui/src/layouts/STYLE_CONSTRAINTS.md',
      ],
    });
  }

  if (backendRequested) {
    standards.push({
      category: 'backend-development-guide',
      requiredWhen: 'backend service, API, auth, menu API, database, deployment, or integration work',
      paths: [
        'docs/后端开发指南/README.md',
        'docs/后端开发指南/01-接入基线与配置规范.md',
        'docs/后端开发指南/02-基础能力复用与架构红线.md',
        'docs/后端开发指南/03-业务开发与接口实现规范.md',
        'docs/后端开发指南/04-AI协作与代码评审规范.md',
      ],
    });
  }

  return standards;
}

function inferProjects(request, explicitProject) {
  if (explicitProject && explicitProject !== 'auto') {
    return [explicitProject];
  }
  const text = request.toLowerCase();
  const projects = [];
  if (/(biz-base|base|主数据|基础|菜单|参数|职工|机构|服务定义|代码|字典)/i.test(request)) {
    projects.push('base');
  }
  if (/(shujumx|数据模型|数据集|质控|dataset|data-model)/i.test(request)) {
    projects.push('shujumx');
  }
  if (/(zhusuoyin|主索引|患者360|patient360|empi|merge|match)/i.test(request)) {
    projects.push('zhusuoyin');
  }
  if (/(main|主应用|登录|导航|菜单接口|顶栏|layout)/i.test(request)) {
    projects.push('main');
  }
  if (/(所有|全部|每个|all projects|all pages)/i.test(request)) {
    return unique(['main', 'base', 'shujumx', 'zhusuoyin', ...projects]);
  }
  return projects.length ? unique(projects) : ['main'];
}

function selectSuperpowerSkills(request) {
  const normalized = request.toLowerCase();
  const selected = new Set(['using-superpowers']);
  for (const [name, entry] of Object.entries(superpowerSkillCatalog)) {
    if (entry.triggers.some((trigger) => normalized.includes(trigger.toLowerCase()))) {
      selected.add(name);
    }
  }
  if (!selected.has('systematic-debugging') && /(不对|不完整|缺失|失败|异常|报错|没|错|broken|fail|error)/i.test(request)) {
    selected.add('systematic-debugging');
  }
  if (!selected.has('verification-before-completion') && /(提交|推送|部署|完成|commit|push|deploy)/i.test(request)) {
    selected.add('verification-before-completion');
  }
  if (/(所有|全部|每个|并行|多 agent|多agent|all)/i.test(request)) {
    selected.add('dispatching-parallel-agents');
    selected.add('using-git-worktrees');
  }
  return [...selected];
}

function choosePrimarySkill(skills) {
  const priority = [
    'systematic-debugging',
    'brainstorming',
    'dispatching-parallel-agents',
    'subagent-driven-development',
    'test-driven-development',
    'verification-before-completion',
    'using-superpowers',
  ];
  return priority.find((skill) => skills.includes(skill)) ?? skills[0];
}

function inferWorkflow(request, skills) {
  if (skills.includes('systematic-debugging')) {
    return 'debug';
  }
  if (skills.includes('brainstorming')) {
    return 'design';
  }
  if (skills.includes('dispatching-parallel-agents')) {
    return 'parallel';
  }
  return 'delivery';
}

async function verify(project, options) {
  section(`Local verification: ${project.name}`);
  const changed = options.changedOnly ? await getChangedAreas(project) : null;
  const profile = normalizeProfile(options.profile);
  const tasks = [];

  if (!options.backendOnly && existsSync(project.frontendDir)) {
    if (!changed || changed.frontend || changed.unknown) {
      const scripts = getFrontendVerificationScripts(project, profile, options);
      for (const script of scripts) {
        tasks.push(() => runPackageManager(project.frontendDir, script));
      }
    } else {
      ok('Skipped frontend verification; no frontend changes detected.');
    }
  }

  if (!options.frontendOnly && existsSync(project.backendDir)) {
    if (!changed || changed.backend || changed.unknown) {
      const mvn = process.platform === 'win32' ? 'mvn.cmd' : 'mvn';
      const goals = getBackendVerificationGoals(profile, options);
      for (const goal of goals) {
        tasks.push(() => run(mvn, ['-q', goal], {
          cwd: project.backendDir,
          timeoutMs: Number(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
          env: localJavaEnv(options),
        }));
      }
    } else {
      ok('Skipped backend verification; no backend changes detected.');
    }
  }

  if (!tasks.length) {
    ok('No local verification tasks selected.');
    return;
  }

  if (options.serialVerify || tasks.length === 1) {
    for (const task of tasks) {
      await task();
    }
  } else {
    await Promise.all(tasks.map((task) => task()));
  }
}

async function review(project, options = {}) {
  const pathspec = buildCommitPathspec(options);
  if (options.json) {
    printJson(await getReview(project, options));
    return;
  }
  section(`Review snapshot: ${project.name}`);
  await run('git', ['status', '--short'], { cwd: project.repoDir });
  await run('git', ['ls-files', '--others', '--exclude-standard', '--', ...pathspec], { cwd: project.repoDir });
  await run('git', ['diff', '--stat', '--', ...pathspec], { cwd: project.repoDir });
  await run('git', ['diff', '--check', '--', ...pathspec], { cwd: project.repoDir });
}

async function claim(project, options) {
  const taskPath = options.task ?? options.config;
  const agent = options.agent;
  if (!taskPath || !agent) {
    throw new Error('Claim requires --task <file> and --agent <name>.');
  }
  const result = await getClaim(project, taskPath, agent, options);
  if (options.json) {
    printJson(result);
    return;
  }
  section(`Claim check: ${project.name}`);
  for (const issue of result.issues) {
    log(`${issue.severity.toUpperCase()} ${issue.file}: ${issue.message}`);
  }
  if (!result.ok) {
    throw new Error(`Claim failed for agent "${agent}".`);
  }
  ok(`Claim passed for agent "${agent}".`);
}

async function commit(project, options) {
  section(`Commit: ${project.name}`);
  const message = options.message ?? options.m;
  if (!message) {
    throw new Error('Commit message is required. Pass --message "fix: ..."');
  }

  const porcelain = await capture('git', ['status', '--porcelain'], { cwd: project.repoDir });
  if (!porcelain.trim()) {
    ok('No source changes to commit.');
    return;
  }

  const pathspec = buildCommitPathspec(options);
  await run('git', ['add', '--', ...pathspec], { cwd: project.repoDir });
  const staged = await capture('git', ['diff', '--cached', '--name-only'], { cwd: project.repoDir });
  if (!staged.trim()) {
    ok('No committable source changes after applying default excludes.');
    return;
  }
  await run('git', ['commit', '-m', message], { cwd: project.repoDir });
}

async function push(project) {
  section(`Push: ${project.name}`);
  await run('git', ['push'], { cwd: project.repoDir });
}

async function triggerAndWaitJenkins(project, options) {
  section(`Jenkins: ${project.jenkinsJob}`);
  const baseUrl = trimSlash(env('YGT_JENKINS_URL'));
  const user = env('YGT_JENKINS_USER', false);
  const token = env('YGT_JENKINS_TOKEN', false) ?? env('YGT_JENKINS_PASSWORD', false);

  if (!user || !token) {
    throw new Error('Set YGT_JENKINS_USER and YGT_JENKINS_TOKEN (or YGT_JENKINS_PASSWORD) before triggering Jenkins.');
  }

  const job = options.job ?? project.jenkinsJob;
  const jobPath = job.split('/').map((part) => `job/${encodeURIComponent(part)}`).join('/');
  const auth = Buffer.from(`${user}:${token}`).toString('base64');
  const headers = { Authorization: `Basic ${auth}` };
  const releaseContext = options.releaseContext;
  const external = releaseContext?.state.stages.jenkins.external ?? {};
  let queueUrl = external.queueUrl ?? null;
  if (!queueUrl && !external.buildUrl) {
    const crumb = await getJenkinsCrumb(baseUrl, headers);
    const buildHeaders = crumb ? { ...headers, ...crumb.headers } : headers;
    const params = parseParameters(options.param);
    const buildUrl = `${baseUrl}/${jobPath}/${params.size ? 'buildWithParameters' : 'build'}`;
    const body = params.size ? new URLSearchParams(params) : undefined;
    const response = await fetch(buildUrl, { method: 'POST', headers: buildHeaders, body });
    if (!response.ok) {
      throw new Error(`Jenkins trigger failed: HTTP ${response.status} ${await response.text()}`);
    }
    queueUrl = response.headers.get('location');
    if (queueUrl && releaseContext) {
      external.queueUrl = queueUrl;
      await releaseContext.persist();
    }
  }
  if (!queueUrl) {
    if (!external.buildUrl) {
      ok('Jenkins build triggered. No queue URL returned.');
      return null;
    }
  }

  const pollMs = Number(options.pollMs ?? env('YGT_JENKINS_POLL_MS', false) ?? DEFAULT_JENKINS_POLL_MS);
  const buildInfo = await waitForJenkinsBuild(
    baseUrl,
    queueUrl,
    headers,
    Number(options.timeoutMs ?? 20 * 60 * 1000),
    pollMs,
    external.buildUrl,
    async (buildUrl) => {
      if (!releaseContext) {return;}
      external.buildUrl = buildUrl;
      await releaseContext.persist();
    },
  );
  ok(`Jenkins ${job} #${buildInfo.number} ${buildInfo.result}: ${buildInfo.url}`);
  if (buildInfo.result !== 'SUCCESS') {
    throw new Error(`Jenkins build failed with result ${buildInfo.result}.`);
  }

  return buildInfo;
}

async function rollout(project, options) {
  section(`K8s rollout: ${project.k8sDeployment}`);
  const namespace = options.namespace ?? env('YGT_K8S_NAMESPACE');
  const deployment = options.deployment ?? project.k8sDeployment;
  const label = options.appLabel ?? project.k8sAppLabel;
  const via = options.via ?? env('YGT_ROLLOUT_VIA', false) ?? 'ssh';
  const commands = [
    `kubectl -n ${shellQuote(namespace)} rollout status deployment/${shellQuote(deployment)} --timeout=240s`,
    `kubectl -n ${shellQuote(namespace)} get deploy,pod,svc -l app=${shellQuote(label)} -o wide`,
  ];
  const command = ['set -e', ...commands].join('\n');

  if (via === 'jenkins') {
    await runJenkinsScript(command);
    return;
  }

  if (via !== 'ssh') {
    throw new Error(`Unknown rollout transport: ${via}`);
  }

  const deployHost = env('YGT_DEPLOY_HOST');
  const deployUser = env('YGT_DEPLOY_USER');
  const target = `${deployUser}@${deployHost}`;
  await run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', target, command], {
    timeoutMs: 5 * 60 * 1000,
  });
}

async function diagnose(project, options) {
  const output = await getDiagnosis(project, options);
  if (options.json) {
    printJson(output);
    return;
  }
  section(`Diagnose: ${project.name}`);
  process.stdout.write(output.text.endsWith('\n') ? output.text : `${output.text}\n`);
}

async function smoke(project, options) {
  section(`Online smoke: ${project.name}`);
  const urls = normalizeList(options.url ?? options.urls);
  const smokeUrls = urls.length ? urls : project.smokeUrls;

  const results = await Promise.all(smokeUrls.map(async (url) => {
    const result = await timedFetch(url, Number(options.timeoutMs ?? 30000));
    return { url, ...result };
  }));

  for (const result of results) {
    const statusOk = result.status >= 200 && result.status < 500;
    log(`${statusOk ? 'OK' : 'FAIL'} ${result.url} -> HTTP ${result.status} (${result.elapsedMs}ms)`);
    if (!statusOk) {
      throw new Error(`Smoke failed: ${result.url} returned HTTP ${result.status}`);
    }
  }
}

async function report(project, options) {
  section(`Report: ${project.name}`);
  const taskId = sanitizeTaskId(options.taskId ?? options.task ?? `ygt-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const runDir = resolve(project.repoDir, '.ygt-runs', taskId);
  mkdirSync(runDir, { recursive: true });

  const data = {
    taskId,
    project: project.name,
    generatedAt: new Date().toISOString(),
    status: await getStatusSnapshot(project),
    impact: await getImpact(project),
    review: await getReview(project, options),
    doctor: options.withDoctor ? await getDoctor(project, options) : undefined,
    selftest: options.withSelftest ? await getSelftest(project, options) : undefined,
  };
  const jsonPath = resolve(runDir, 'report.json');
  const mdPath = resolve(runDir, 'report.md');
  writeFileSync(jsonPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  writeFileSync(mdPath, renderMarkdownReport(data), 'utf8');
  ok(`Report written: ${jsonPath}`);
  ok(`Report written: ${mdPath}`);
}

function printHelp() {
  console.log(`YGT workflow harness

Usage:
  node scripts/harness/ygt-workflow.mjs <command> [options]
  node scripts/harness/ygt-workflow.mjs /ygt <one-sentence request> [--project auto]

Commands:
  env       Print resolved environment and project defaults
  status    Show git status and recent commits
  impact    Analyze changed files and choose verification scope
  doctor    Check local/env/remote readiness before release
  selftest  Validate harness, plugin, docs, and workflow metadata
  intake    Route one-sentence requests to Superpowers skills and harness commands
  /ygt      Slash-style alias for intake
  verify    Run local frontend/backend verification
  review    Show diff summary and run git diff --check
  claim     Validate current changes against a task/agent path claim
  commit    Commit current changes, requires --message
  push      Push current branch
  jenkins   Trigger Jenkins and wait for SUCCESS
  rollout   Verify K8s rollout and service/pod state through SSH
  diagnose  Collect K8s rollout/pod/log diagnostics
  smoke     Run HTTP smoke checks
  report    Write .ygt-runs/<task-id>/report.json and report.md
  release   impact -> review -> commit -> push -> doctor -> jenkins -> rollout -> smoke
  full      status -> impact -> verify -> review -> commit -> push -> doctor -> jenkins -> rollout -> smoke
  resume    Continue a durable release/full run after restart

Common options:
  --project main|base|huanzhe360|zhusuoyin|shujumx
  --request "一句话需求或问题"
  --message "fix: ..."
  --job <jenkins-job>
  --url <smoke-url>       Can be repeated
  --param KEY=VALUE       Can be repeated for Jenkins parameters
  --via ssh|jenkins       Rollout command transport, default: ssh
  --frontend-only
  --backend-only
  --profile quick|standard|full
  --changed-only          Verify only changed frontend/backend area when safe
  --serial-verify         Run frontend/backend verification serially
  --include <pathspec>    Limit commit/claim scope, can be repeated
  --exclude <pathspec>    Exclude commit/claim scope, can be repeated
  --task <file>           Task manifest for claim, or task id for report
  --state-file <path>     Explicit durable release/full state path
  --rollback-command <s>  Explicit rollback command after final smoke failure
  --agent <name>          Agent name for claim
  --json                  Print machine-readable JSON for supported commands
  --poll-ms <ms>          Jenkins polling interval, default ${DEFAULT_JENKINS_POLL_MS}
  --tail <n>              Log tail lines for diagnose, default ${DEFAULT_DIAGNOSE_TAIL}
  --with-doctor           Include doctor results in report
  --with-selftest         Include harness/plugin selftest results in report
  --no-commit
  --skip-doctor
  --skip-rollout

Credentials are read from environment variables, ignored local env files, or the installed dfhis-company-environment reference when present. See scripts/harness/ygt-env.example.ps1.
`);
}

function printEnv(project) {
  const resolved = {
    project: project.name,
    repoDir: project.repoDir,
    frontendDir: project.frontendDir,
    backendDir: project.backendDir,
    jenkinsJob: project.jenkinsJob,
    k8sNamespace: project.k8sNamespace,
    k8sDeployment: project.k8sDeployment,
    prodUrl: project.prodUrl,
    ...envDefaults,
    hasJenkinsUser: Boolean(process.env.YGT_JENKINS_USER),
    hasJenkinsToken: Boolean(process.env.YGT_JENKINS_TOKEN || process.env.YGT_JENKINS_PASSWORD),
    hasMainPassword: Boolean(process.env.YGT_MAIN_PASSWORD),
    hasDorisPassword: Boolean(process.env.YGT_DORIS_PASSWORD),
    hasNacosPassword: Boolean(process.env.YGT_NACOS_PASSWORD),
    hasGatewayPassword: Boolean(process.env.YGT_GATEWAY_PASSWORD),
    companyReferenceLoaded: Boolean(process.env.YGT_COMPANY_REFERENCE_PATH),
  };
  console.log(JSON.stringify(resolved, null, 2));
}

function getProject(name) {
  const project = projects[name];
  if (!project) {
    throw new Error(`Unknown project "${name}". Known projects: ${Object.keys(projects).join(', ')}`);
  }
  return project;
}

function normalizeCommand(action) {
  const aliases = {
    '/ygt': 'intake',
    ygt: 'intake',
  };
  return aliases[action] ?? action;
}

async function runPackageManager(cwd, scriptName) {
  const command = existsSync(resolve(cwd, 'pnpm-lock.yaml')) ? 'pnpm' : 'npm';
  const executable = process.platform === 'win32' ? `${command}.cmd` : command;
  await run(executable, ['run', scriptName], {
    cwd,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });
}

async function getJenkinsCrumb(baseUrl, headers) {
  const response = await fetch(`${baseUrl}/crumbIssuer/api/json`, { headers });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Jenkins crumb failed: HTTP ${response.status} ${await response.text()}`);
  }
  const crumb = await response.json();
  const cookie = response.headers.get('set-cookie');
  return {
    headers: {
      [crumb.crumbRequestField]: crumb.crumb,
      ...(cookie ? { Cookie: cookie.split(';')[0] } : {}),
    },
  };
}

async function runJenkinsScript(command) {
  const baseUrl = trimSlash(env('YGT_JENKINS_URL'));
  const user = env('YGT_JENKINS_USER', false);
  const token = env('YGT_JENKINS_TOKEN', false) ?? env('YGT_JENKINS_PASSWORD', false);

  if (!user || !token) {
    throw new Error('Set YGT_JENKINS_USER and YGT_JENKINS_TOKEN (or YGT_JENKINS_PASSWORD) before using --via jenkins.');
  }

  const auth = Buffer.from(`${user}:${token}`).toString('base64');
  const headers = { Authorization: `Basic ${auth}` };
  const crumb = await getJenkinsCrumb(baseUrl, headers);
  const scriptHeaders = {
    ...headers,
    ...(crumb ? crumb.headers : {}),
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  const script = [
    `def proc = ['bash', '-lc', ${JSON.stringify(command)}].execute()`,
    'def out = new StringBuffer()',
    'def err = new StringBuffer()',
    'proc.consumeProcessOutput(out, err)',
    'proc.waitFor()',
    'print(out.toString())',
    'if (err.length() > 0) { print(err.toString()) }',
    'if (proc.exitValue() != 0) { throw new RuntimeException("Command failed: " + proc.exitValue()) }',
  ].join('\n');

  log(`$ jenkins-script ${command}`);
  const response = await fetch(`${baseUrl}/scriptText`, {
    method: 'POST',
    headers: scriptHeaders,
    body: new URLSearchParams({ script }),
  });
  const text = await response.text();

  if (text.trim()) {
    process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
  }
  if (!response.ok) {
    throw new Error(`Jenkins script failed: HTTP ${response.status}`);
  }
}

async function waitForJenkinsBuild(
  baseUrl,
  queueUrl,
  headers,
  timeoutMs,
  pollMs,
  resumedBuildUrl = null,
  onBuildUrl = async () => {},
) {
  const startedAt = Date.now();
  let executableUrl = resumedBuildUrl;

  while (!executableUrl && Date.now() - startedAt < timeoutMs) {
    const queue = await getJson(`${queueUrl}api/json`, headers);
    if (queue.executable?.url) {
      executableUrl = queue.executable.url;
      await onBuildUrl(executableUrl);
      break;
    }
    log(`Waiting Jenkins queue item: ${queue.why ?? 'pending'}`);
    await sleep(pollMs);
  }

  if (!executableUrl) {
    throw new Error('Timed out waiting for Jenkins queue to start.');
  }

  while (Date.now() - startedAt < timeoutMs) {
    const build = await getJson(`${executableUrl}api/json`, headers);
    if (!build.building) {
      return {
        number: build.number,
        result: build.result,
        url: build.url ?? executableUrl,
        duration: build.duration,
      };
    }
    log(`Waiting Jenkins build #${build.number}...`);
    await sleep(pollMs);
  }

  throw new Error('Timed out waiting for Jenkins build to finish.');
}

async function getJson(url, headers) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`GET ${url} failed: HTTP ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function timedFetch(url, timeoutMs) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return { status: response.status, elapsedMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timeout);
  }
}

async function getStatusSnapshot(project) {
  const [branch, status, recentCommits] = await Promise.all([
    capture('git', ['branch', '--show-current'], { cwd: project.repoDir }),
    capture('git', ['status', '--short', '--branch'], { cwd: project.repoDir }),
    capture('git', ['log', '--oneline', '-5'], { cwd: project.repoDir }),
  ]);
  return {
    branch: branch.trim(),
    status: status.trimEnd().split(/\r?\n/).filter(Boolean),
    recentCommits: recentCommits.trimEnd().split(/\r?\n/).filter(Boolean),
  };
}

async function getImpact(project) {
  const files = await getChangedFiles(project);
  const impactFiles = files.map((file) => ({
    ...file,
    area: categorizeFile(project, file.path),
  }));
  const areas = unique(impactFiles.map((file) => file.area).filter((area) => area !== 'none'));
  const risks = [];
  if (impactFiles.some((file) => file.area === 'shared')) {
    risks.push('shared-files');
  }
  if (impactFiles.some((file) => file.area === 'harness')) {
    risks.push('harness-change');
  }
  if (impactFiles.some((file) => /(^|\/)(package\.json|pnpm-lock\.yaml|package-lock\.json|pom\.xml)$/.test(file.path))) {
    risks.push('dependency-or-build-config');
  }
  if (impactFiles.some((file) => /(^|\/)ygt-env\..*\.ps1$/.test(file.path))) {
    risks.push('local-secret-file');
  }

  const changedAreas = await getChangedAreas(project);
  let verifyHint = 'none';
  if (changedAreas.unknown || (changedAreas.frontend && changedAreas.backend)) {
    verifyHint = 'full';
  } else if (changedAreas.frontend) {
    verifyHint = 'frontend-only';
  } else if (changedAreas.backend) {
    verifyHint = 'backend-only';
  }

  return {
    project: project.name,
    repoDir: project.repoDir,
    files: impactFiles,
    areas,
    changedAreas,
    verifyHint,
    risks,
  };
}

async function getReview(project, options = {}) {
  const pathspec = buildCommitPathspec(options);
  const [status, untracked, diffStat, diffCheck] = await Promise.all([
    captureResult('git', ['status', '--short'], { cwd: project.repoDir }),
    captureResult('git', ['ls-files', '--others', '--exclude-standard', '--', ...pathspec], { cwd: project.repoDir }),
    captureResult('git', ['diff', '--stat', '--', ...pathspec], { cwd: project.repoDir }),
    captureResult('git', ['diff', '--check', '--', ...pathspec], { cwd: project.repoDir }),
  ]);
  return {
    project: project.name,
    pathspec,
    status,
    untracked,
    diffStat,
    diffCheck,
    ok: status.code === 0 && untracked.code === 0 && diffStat.code === 0 && diffCheck.code === 0,
  };
}

async function getDoctor(project, options = {}) {
  const checks = [];
  checks.push(check('repoDir', existsSync(project.repoDir), project.repoDir));
  checks.push(check('frontendDir', !project.frontendDir || existsSync(project.frontendDir), project.frontendDir));
  checks.push(check('backendDir', !project.backendDir || existsSync(project.backendDir), project.backendDir));

  const packageScripts = getPackageScripts(project.frontendDir);
  if (project.frontendDir) {
    checks.push(check('frontend package', Boolean(packageScripts), packageScripts ? `scripts: ${Object.keys(packageScripts).sort().join(', ')}` : 'package.json missing'));
  }
  if (project.backendDir) {
    checks.push(check('backend pom', existsSync(resolve(project.backendDir, 'pom.xml')), resolve(project.backendDir, 'pom.xml')));
  }

  const localHarnessChecks = await getLocalHarnessChecks(project);
  checks.push(...localHarnessChecks);

  const jenkinsUser = process.env.YGT_JENKINS_USER;
  const jenkinsToken = process.env.YGT_JENKINS_TOKEN ?? process.env.YGT_JENKINS_PASSWORD;
  checks.push(check('jenkins credentials', Boolean(jenkinsUser && jenkinsToken), jenkinsUser && jenkinsToken ? 'present in environment' : 'missing YGT_JENKINS_USER and token/password'));

  if (jenkinsUser && jenkinsToken) {
    const jenkinsUrl = trimSlash(env('YGT_JENKINS_URL'));
    const auth = Buffer.from(`${jenkinsUser}:${jenkinsToken}`).toString('base64');
    const result = await fetchStatus(`${jenkinsUrl}/whoAmI/api/json`, {
      headers: { Authorization: `Basic ${auth}` },
      timeoutMs: Number(options.timeoutMs ?? 10000),
    });
    checks.push(check('jenkins reachable', result.ok, result.message));
  }

  const smokeResults = await Promise.all(project.smokeUrls.map(async (url) => {
    const result = await timedFetch(url, Number(options.timeoutMs ?? 10000))
      .then((value) => ({ ok: value.status >= 200 && value.status < 500, message: `HTTP ${value.status} (${value.elapsedMs}ms)` }))
      .catch((error) => ({ ok: false, message: error.message }));
    return { url, ...result };
  }));
  for (const result of smokeResults) {
    checks.push(check(`smoke ${result.url}`, result.ok, result.message));
  }

  return {
    project: project.name,
    checks,
    ok: checks.every((item) => item.ok),
  };
}

async function getSelftest(project, options = {}) {
  const checks = [];
  checks.push(...await getLocalHarnessChecks(project));

  const nodeCheckTargets = [
    resolve(repoRoot, 'scripts', 'harness', 'ygt-workflow.mjs'),
    resolve(repoRoot, 'scripts', 'harness', 'install-ygt-codex-plugin.mjs'),
  ];
  for (const target of nodeCheckTargets) {
    const result = await captureResult(process.execPath, ['--check', target], {
      cwd: repoRoot,
      timeoutMs: Number(options.timeoutMs ?? 30000),
    });
    checks.push(check(`node --check ${relative(repoRoot, target)}`, result.code === 0, result.stderr.trim() || 'syntax ok'));
  }

  const intake = buildIntakePlan('菜单接口返回不完整，需要排查并修复后部署', 'auto');
  checks.push(check('intake routes project', intake.projects.includes('main'), `projects: ${intake.projects.join(', ')}`));
  checks.push(check('intake returns standards', intake.standards.length > 0, `standards: ${intake.standards.length}`));
  checks.push(check('intake returns commands', intake.commands.some((command) => command.includes('verify')), `commands: ${intake.commands.length}`));

  const linkResult = checkMarkdownLinks(resolve(repoRoot, 'docs'));
  checks.push(check('docs markdown links', linkResult.ok, linkResult.ok ? `${linkResult.filesChecked} files checked` : linkResult.missing.join('; ')));

  checks.push(check(
    'commit excludes local env',
    defaultCommitPathspec.some((item) => item.includes('ygt-env.*.local.ps1')),
    'default pathspec excludes ygt-env.*.local.ps1',
  ));

  const projectNames = Object.keys(projects);
  checks.push(check('project catalog', projectNames.length >= 5, projectNames.join(', ')));
  for (const [name, item] of Object.entries(projects)) {
    checks.push(check(`project ${name} has jenkins job`, Boolean(item.jenkinsJob), item.jenkinsJob ?? 'missing'));
    checks.push(check(`project ${name} has smoke urls`, Boolean(item.smokeUrls?.length), (item.smokeUrls ?? []).join(', ')));
  }

  return {
    project: project.name,
    generatedAt: new Date().toISOString(),
    checks,
    ok: checks.every((item) => item.ok),
  };
}

async function getLocalHarnessChecks(project) {
  const checks = [];
  const requiredFiles = [
    'scripts/harness/ygt-workflow.mjs',
    'scripts/harness/install-ygt-codex-plugin.mjs',
    'scripts/harness/install-ygt-codex-plugin.cmd',
    'scripts/harness/install-ygt-codex-plugin.command',
    'scripts/harness/ygt-qiankun-e2e.mjs',
    'scripts/harness/ygt-env.example.ps1',
    'scripts/harness/ygt-env.company-dev.ps1',
    'plugins/ygt/.codex-plugin/plugin.json',
    'plugins/ygt/skills/ygt/SKILL.md',
    'plugins/ygt/skills/ygt/agents/openai.yaml',
    '.agents/plugins/marketplace.json',
    'docs/README.md',
    'docs/03-AI协作指南.md',
    'docs/04-YGT工作流Harness.md',
  ];

  for (const file of requiredFiles) {
    checks.push(check(`required file ${file}`, existsSync(resolve(repoRoot, file)), file));
  }

  const pluginManifest = readJsonIfExists(resolve(repoRoot, 'plugins', 'ygt', '.codex-plugin', 'plugin.json'));
  checks.push(check('plugin manifest json', Boolean(pluginManifest), 'plugins/ygt/.codex-plugin/plugin.json'));
  if (pluginManifest) {
    checks.push(check('plugin name', pluginManifest.name === 'ygt', pluginManifest.name));
    checks.push(check('plugin skills path', pluginManifest.skills === './skills/', pluginManifest.skills));
    checks.push(check('plugin version', Boolean(pluginManifest.version), pluginManifest.version));
  }

  const marketplace = readJsonIfExists(resolve(repoRoot, '.agents', 'plugins', 'marketplace.json'));
  const hasYgtPlugin = marketplace?.plugins?.some((plugin) => plugin.name === 'ygt' && plugin.source?.path === './plugins/ygt');
  checks.push(check('marketplace exposes ygt plugin', hasYgtPlugin, '.agents/plugins/marketplace.json'));

  const pluginSkill = readTextIfExists(resolve(repoRoot, 'plugins', 'ygt', 'skills', 'ygt', 'SKILL.md'));
  checks.push(check('plugin skill frontmatter', /^---\r?\nname:\s*ygt/m.test(pluginSkill ?? ''), 'plugins/ygt/skills/ygt/SKILL.md'));
  checks.push(check('plugin skill runs intake', /ygt-workflow\.mjs \/ygt/.test(pluginSkill ?? ''), 'skill references harness intake'));

  const companyEnv = readTextIfExists(resolve(repoRoot, 'scripts', 'harness', 'ygt-env.company-dev.ps1'));
  checks.push(check('company env loads local override', /ygt-env\.company-dev\.local\.ps1/.test(companyEnv ?? ''), 'local override file is supported'));

  const workflowScript = readTextIfExists(resolve(repoRoot, 'scripts', 'harness', 'ygt-workflow.mjs'));
  checks.push(check('workflow bootstraps local env', /bootstrapLocalPowerShellEnv\(\)/.test(workflowScript ?? '') && /ygt-env\.company-dev\.ps1/.test(workflowScript ?? ''), 'harness loads PowerShell env defaults'));
  checks.push(check('workflow auto-discovers company env reference', /bootstrapCompanyEnvironmentReference\(\)/.test(workflowScript ?? '') && /findCompanyEnvironmentReference\(\)/.test(workflowScript ?? ''), 'harness can read installed dfhis-company-environment reference'));

  const gitignore = readTextIfExists(resolve(repoRoot, '.gitignore'));
  checks.push(check('gitignore excludes company local env', /ygt-env\.company-dev\.local\.ps1/.test(gitignore ?? '') || /ygt-env\.\*\.local\.ps1/.test(gitignore ?? ''), '.gitignore'));
  checks.push(check('gitignore excludes run reports', /\.ygt-runs\//.test(gitignore ?? ''), '.gitignore'));

  checks.push(check('project repo exists', existsSync(project.repoDir), project.repoDir));
  return checks;
}

async function getDiagnosis(project, options = {}) {
  const namespace = options.namespace ?? env('YGT_K8S_NAMESPACE');
  const deployment = options.deployment ?? project.k8sDeployment;
  const label = options.appLabel ?? project.k8sAppLabel;
  const tail = Number(options.tail ?? DEFAULT_DIAGNOSE_TAIL);
  const command = [
    'set +e',
    `echo '--- rollout status: ${deployment} ---'`,
    `kubectl -n ${shellQuote(namespace)} rollout status deployment/${shellQuote(deployment)} --timeout=20s`,
    `echo '--- resources: app=${label} ---'`,
    `kubectl -n ${shellQuote(namespace)} get deploy,rs,pod,svc,endpoints -l app=${shellQuote(label)} -o wide`,
    `echo '--- pod summary: app=${label} ---'`,
    `kubectl -n ${shellQuote(namespace)} get pod -l app=${shellQuote(label)} -o jsonpath='{range .items[*]}{.metadata.name}{"\\t"}{.status.phase}{"\\t"}{range .status.containerStatuses[*]}ready={.ready},restart={.restartCount},waiting={.state.waiting.reason}{" "}{end}{"\\n"}{end}'`,
    `for pod in $(kubectl -n ${shellQuote(namespace)} get pod -l app=${shellQuote(label)} -o jsonpath='{range .items[*]}{.metadata.name}{"\\n"}{end}'); do`,
    `  echo "--- logs: $pod previous tail=${tail} ---"`,
    `  kubectl -n ${shellQuote(namespace)} logs "$pod" --previous --tail=${tail} 2>&1 || true`,
    `  echo "--- logs: $pod current tail=${tail} ---"`,
    `  kubectl -n ${shellQuote(namespace)} logs "$pod" --tail=${tail} 2>&1 || true`,
    'done',
  ].join('\n');
  const text = await runRemoteCapture(command, options);
  return {
    project: project.name,
    namespace,
    deployment,
    label,
    text: redactSensitive(text),
  };
}

async function getClaim(project, taskPath, agent, options = {}) {
  const task = loadTaskConfig(resolve(project.repoDir, taskPath));
  const agentConfig = task.agents?.[agent];
  if (!agentConfig) {
    throw new Error(`Agent "${agent}" is not defined in ${taskPath}.`);
  }
  const files = await getChangedFiles(project);
  const includes = normalizeList(options.include).length ? normalizeList(options.include) : normalizeList(agentConfig.include);
  const excludes = [...normalizeList(agentConfig.exclude), ...normalizeList(options.exclude)];
  const exclusivePaths = normalizeList(task.exclusivePaths);
  const issues = [];

  for (const file of files) {
    if (exclusivePaths.some((pattern) => matchesPath(file.path, pattern)) && !options.allowExclusive) {
      issues.push({ severity: 'error', file: file.path, message: 'touches exclusivePaths; integration owner should handle this file' });
      continue;
    }
    if (includes.length && !includes.some((pattern) => matchesPath(file.path, pattern))) {
      issues.push({ severity: 'error', file: file.path, message: 'outside agent include scope' });
    }
    if (excludes.some((pattern) => matchesPath(file.path, pattern))) {
      issues.push({ severity: 'error', file: file.path, message: 'matches agent exclude scope' });
    }
  }

  return {
    project: project.name,
    taskId: task.taskId,
    agent,
    includes,
    excludes,
    exclusivePaths,
    files,
    issues,
    ok: !issues.some((issue) => issue.severity === 'error'),
  };
}

async function getChangedFiles(project) {
  const status = await capture('git', ['status', '--porcelain', '-uall', '--', ...defaultCommitPathspec], { cwd: project.repoDir });
  return status.split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const statusCode = line.slice(0, 2).trim() || '??';
      const rawPath = line.slice(3).trim();
      const path = rawPath.includes(' -> ') ? rawPath.split(' -> ').pop() : rawPath;
      return { status: statusCode, path };
    });
}

function categorizeFile(project, file) {
  const frontendPrefix = toGitPath(relative(project.repoDir, project.frontendDir));
  const backendPrefix = toGitPath(relative(project.repoDir, project.backendDir));
  if (frontendPrefix && isUnder(file, frontendPrefix)) {
    return /\.(test|spec)\.(ts|tsx|js|jsx|vue)$/.test(file) || file.includes('/__tests__/') ? 'frontend-test' : 'frontend';
  }
  if (backendPrefix && isUnder(file, backendPrefix)) {
    return file.includes('/src/test/') ? 'backend-test' : 'backend';
  }
  if (file.startsWith('scripts/harness/') || file === 'docs/04-YGT工作流Harness.md') {
    return 'harness';
  }
  if (file.startsWith('docs/') || file.endsWith('.md')) {
    return 'docs';
  }
  if (/(^|\/)(package\.json|pnpm-lock\.yaml|package-lock\.json|pom\.xml|vite\.config\.)/.test(file)) {
    return 'shared';
  }
  if (file === '.gitignore' || file.startsWith('.github/') || file.startsWith('.husky/')) {
    return 'config';
  }
  return 'unknown';
}

function getFrontendVerificationScripts(project, profile, options) {
  const packageScripts = getPackageScripts(project.frontendDir);
  if (!packageScripts) {
    return [];
  }
  const requested = normalizeList(options.frontendScript);
  const scripts = requested.length
    ? requested
    : profile
      ? frontendProfileScripts[profile]
      : ['build'];
  const selected = [];
  const seen = new Set();
  for (const script of scripts) {
    if (seen.has(script)) {
      continue;
    }
    seen.add(script);
    if (packageScripts[script]) {
      selected.push(script);
    } else if (profile) {
      ok(`Skipped missing frontend script "${script}" for ${project.name}.`);
    }
  }
  return selected;
}

function getBackendVerificationGoals(profile, options) {
  const requested = normalizeList(options.backendGoal);
  if (requested.length) {
    return requested;
  }
  return profile ? backendProfileGoals[profile] : ['test'];
}

function getPackageScripts(frontendDir) {
  const packagePath = resolve(frontendDir, 'package.json');
  if (!existsSync(packagePath)) {
    return null;
  }
  return JSON.parse(readFileSync(packagePath, 'utf8')).scripts ?? {};
}

function normalizeProfile(value) {
  if (!value) {
    return null;
  }
  if (!frontendProfileScripts[value]) {
    throw new Error(`Unknown verify profile "${value}". Use quick, standard, or full.`);
  }
  return value;
}

function buildCommitPathspec(options = {}) {
  const includes = normalizeList(options.include);
  const excludes = normalizeList(options.exclude).map((item) => `:(exclude)${item}`);
  return [
    ...(includes.length ? includes : defaultCommitPathspec),
    ...(includes.length ? defaultCommitPathspec.slice(1) : []),
    ...excludes,
  ];
}

async function runRemoteCapture(command, options = {}) {
  const via = options.via ?? env('YGT_ROLLOUT_VIA', false) ?? 'ssh';
  if (via === 'jenkins') {
    return runJenkinsScriptCapture(command);
  }
  if (via !== 'ssh') {
    throw new Error(`Unknown remote transport: ${via}`);
  }
  const deployHost = env('YGT_DEPLOY_HOST');
  const deployUser = env('YGT_DEPLOY_USER');
  const target = `${deployUser}@${deployHost}`;
  const result = await captureResult('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', target, command], {
    timeoutMs: 5 * 60 * 1000,
  });
  return `${result.stdout}${result.stderr}`;
}

async function runJenkinsScriptCapture(command) {
  const baseUrl = trimSlash(env('YGT_JENKINS_URL'));
  const user = env('YGT_JENKINS_USER', false);
  const token = env('YGT_JENKINS_TOKEN', false) ?? env('YGT_JENKINS_PASSWORD', false);

  if (!user || !token) {
    throw new Error('Set YGT_JENKINS_USER and YGT_JENKINS_TOKEN (or YGT_JENKINS_PASSWORD) before using --via jenkins.');
  }

  const auth = Buffer.from(`${user}:${token}`).toString('base64');
  const headers = { Authorization: `Basic ${auth}` };
  const crumb = await getJenkinsCrumb(baseUrl, headers);
  const scriptHeaders = {
    ...headers,
    ...(crumb ? crumb.headers : {}),
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  const script = [
    `def proc = ['bash', '-lc', ${JSON.stringify(command)}].execute()`,
    'def out = new StringBuffer()',
    'def err = new StringBuffer()',
    'proc.consumeProcessOutput(out, err)',
    'proc.waitFor()',
    'print(out.toString())',
    'if (err.length() > 0) { print(err.toString()) }',
    'if (proc.exitValue() != 0) { throw new RuntimeException("Command failed: " + proc.exitValue()) }',
  ].join('\n');
  const response = await fetch(`${baseUrl}/scriptText`, {
    method: 'POST',
    headers: scriptHeaders,
    body: new URLSearchParams({ script }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Jenkins script failed: HTTP ${response.status} ${text}`);
  }
  return text;
}

async function fetchStatus(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10000);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { headers: options.headers, signal: controller.signal });
    return {
      ok: response.ok,
      status: response.status,
      message: `HTTP ${response.status} (${Date.now() - startedAt}ms)`,
    };
  } catch (error) {
    return {
      ok: false,
      message: error.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function loadTaskConfig(path) {
  if (!existsSync(path)) {
    throw new Error(`Task manifest not found: ${path}`);
  }
  const text = readFileSync(path, 'utf8');
  if (path.endsWith('.json')) {
    return JSON.parse(text);
  }
  return parseSimpleTaskYaml(text);
}

function parseSimpleTaskYaml(text) {
  const result = { agents: {}, exclusivePaths: [] };
  let currentTop = null;
  let currentAgent = null;
  let currentList = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trimEnd();
    if (!line.trim()) {
      continue;
    }
    const indent = raw.match(/^\s*/)[0].length;
    const trimmed = line.trim();

    if (indent === 0) {
      const match = trimmed.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (!match) {
        continue;
      }
      currentTop = match[1];
      currentAgent = null;
      currentList = null;
      if (match[2]) {
        result[currentTop] = stripYamlScalar(match[2]);
      } else if (currentTop === 'agents') {
        result.agents ??= {};
      } else if (currentTop === 'exclusivePaths') {
        result.exclusivePaths ??= [];
      }
      continue;
    }

    if (currentTop === 'agents' && indent === 2) {
      const match = trimmed.match(/^([A-Za-z0-9_-]+):\s*$/);
      if (match) {
        currentAgent = match[1];
        result.agents[currentAgent] ??= {};
      }
      continue;
    }

    if (currentTop === 'agents' && currentAgent && indent === 4) {
      const match = trimmed.match(/^(include|exclude):\s*$/);
      if (match) {
        currentList = match[1];
        result.agents[currentAgent][currentList] ??= [];
      }
      continue;
    }

    if (currentTop === 'agents' && currentAgent && currentList && indent >= 6 && trimmed.startsWith('- ')) {
      result.agents[currentAgent][currentList].push(stripYamlScalar(trimmed.slice(2)));
      continue;
    }

    if (currentTop === 'exclusivePaths' && indent >= 2 && trimmed.startsWith('- ')) {
      result.exclusivePaths.push(stripYamlScalar(trimmed.slice(2)));
    }
  }
  return result;
}

function stripYamlScalar(value) {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

function matchesPath(file, pattern) {
  const normalizedFile = toGitPath(file);
  const normalizedPattern = toGitPath(pattern).replace(/^\.\//, '');
  if (!normalizedPattern || normalizedPattern === '.') {
    return true;
  }
  if (normalizedPattern.endsWith('/**')) {
    return isUnder(normalizedFile, normalizedPattern.slice(0, -3));
  }
  if (normalizedPattern.includes('*')) {
    const regex = new RegExp(`^${escapeRegex(normalizedPattern).replace(/\\\*\\\*/g, '.*').replace(/\\\*/g, '[^/]*')}$`);
    return regex.test(normalizedFile);
  }
  return normalizedFile === normalizedPattern || isUnder(normalizedFile, normalizedPattern);
}

function renderMarkdownReport(data) {
  const lines = [
    `# YGT Workflow Report: ${data.taskId}`,
    '',
    `- Project: ${data.project}`,
    `- Generated: ${data.generatedAt}`,
    `- Branch: ${data.status.branch}`,
    `- Impact areas: ${data.impact.areas.length ? data.impact.areas.join(', ') : 'none'}`,
    `- Verify hint: ${data.impact.verifyHint}`,
    `- Review: ${data.review.ok ? 'OK' : 'FAILED'}`,
    '',
    '## Changed Files',
    '',
    ...data.impact.files.map((file) => `- ${file.status} ${file.path} (${file.area})`),
    '',
    '## Recent Commits',
    '',
    ...data.status.recentCommits.map((commit) => `- ${commit}`),
    '',
  ];
  if (data.doctor) {
    lines.push('## Doctor', '');
    for (const checkItem of data.doctor.checks) {
      lines.push(`- ${checkItem.ok ? 'OK' : 'WARN'} ${checkItem.name}: ${checkItem.message}`);
    }
    lines.push('');
  }
  if (data.selftest) {
    lines.push('## Harness Selftest', '');
    for (const checkItem of data.selftest.checks) {
      lines.push(`- ${checkItem.ok ? 'OK' : 'FAIL'} ${checkItem.name}: ${checkItem.message}`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function check(name, okValue, message) {
  return { name, ok: Boolean(okValue), message: String(message ?? '') };
}

function readJsonIfExists(path) {
  if (!existsSync(path)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function readTextIfExists(path) {
  if (!existsSync(path)) {
    return null;
  }
  return readFileSync(path, 'utf8');
}

function checkMarkdownLinks(rootDir) {
  const files = listMarkdownFiles(rootDir);
  const missing = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const linkRegex = /\[[^\]]+\]\(([^)]+)\)/g;
    for (const match of text.matchAll(linkRegex)) {
      const rawTarget = match[1].trim();
      if (!rawTarget || /^(https?:|mailto:|#)/i.test(rawTarget)) {
        continue;
      }
      const targetWithoutAnchor = rawTarget.split('#')[0];
      if (!targetWithoutAnchor) {
        continue;
      }
      const decodedTarget = safeDecodeUri(targetWithoutAnchor);
      const absoluteTarget = resolve(dirname(file), decodedTarget);
      if (!existsSync(absoluteTarget)) {
        missing.push(`${toGitPath(relative(repoRoot, file))} -> ${decodedTarget}`);
      }
    }
  }
  return {
    ok: missing.length === 0,
    filesChecked: files.length,
    missing,
  };
}

function listMarkdownFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }
  const result = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...listMarkdownFiles(path));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      result.push(path);
    }
  }
  return result;
}

function safeDecodeUri(value) {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
}

function sanitizeTaskId(value) {
  return String(value).replace(/[^A-Za-z0-9_.-]/g, '-');
}

function redactSensitive(text) {
  return String(text)
    .replace(/([Pp]assword|[Tt]oken|[Ss]ecret|[Aa]uthorization)([=:]\s*)\S+/g, '$1$2***')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer ***');
}

function unique(values) {
  return [...new Set(values)];
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.*]/g, '\\$&');
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function parseArgs(argv) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      result._.push(arg);
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
    const key = toCamelCase(rawKey);
    const value = inlineValue ?? argv[index + 1];

    if (inlineValue === undefined && (value === undefined || value.startsWith('--'))) {
      result[key] = true;
      continue;
    }

    if (inlineValue === undefined) {
      index += 1;
    }

    if (result[key] === undefined) {
      result[key] = value;
    } else if (Array.isArray(result[key])) {
      result[key].push(value);
    } else {
      result[key] = [result[key], value];
    }
  }
  return result;
}

function parseParameters(input) {
  const params = new Map();
  for (const item of normalizeList(input)) {
    const splitAt = item.indexOf('=');
    if (splitAt <= 0) {
      throw new Error(`Invalid Jenkins parameter "${item}". Use KEY=VALUE.`);
    }
    params.set(item.slice(0, splitAt), item.slice(splitAt + 1));
  }
  return params;
}

function normalizeList(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function localJavaEnv(options) {
  const javaHome = options.javaHome ?? process.env.JAVA_HOME;
  if (!javaHome) {
    return process.env;
  }
  return {
    ...process.env,
    JAVA_HOME: javaHome,
    Path: `${resolve(javaHome, 'bin')};${process.env.Path ?? ''}`,
  };
}

async function getChangedAreas(project) {
  const frontendPrefix = toGitPath(relative(project.repoDir, project.frontendDir));
  const backendPrefix = toGitPath(relative(project.repoDir, project.backendDir));
  const diff = await capture('git', ['diff', '--name-only', 'HEAD', '--', ...defaultCommitPathspec], { cwd: project.repoDir });
  const untracked = await capture('git', ['ls-files', '--others', '--exclude-standard', '--', ...defaultCommitPathspec], { cwd: project.repoDir });
  const files = [...diff.split(/\r?\n/), ...untracked.split(/\r?\n/)]
    .map((file) => file.trim())
    .filter(Boolean);

  if (!files.length) {
    return { frontend: false, backend: false, unknown: false };
  }

  const frontend = files.some((file) => isUnder(file, frontendPrefix));
  const backend = files.some((file) => isUnder(file, backendPrefix));
  const unknown = files.some((file) => !isUnder(file, frontendPrefix) && !isUnder(file, backendPrefix));
  return { frontend, backend, unknown };
}

function isUnder(file, prefix) {
  return file === prefix || file.startsWith(`${prefix}/`);
}

function toGitPath(value) {
  return value.split(sep).join('/');
}

function env(key, required = true) {
  const value = process.env[key] ?? envDefaults[key];
  if (required && !value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
}

function bootstrapLocalPowerShellEnv() {
  if (process.env.YGT_HARNESS_SKIP_ENV_BOOTSTRAP === '1') return;
  if (process.env.YGT_HARNESS_ENV_BOOTSTRAPPED === '1') return;

  const companyEnvPath = resolve(repoRoot, 'scripts', 'harness', 'ygt-env.company-dev.ps1');
  if (!existsSync(companyEnvPath)) return;

  const executable = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
  const script = [
    '$ErrorActionPreference = "Stop"',
    '$WarningPreference = "SilentlyContinue"',
    `. ${toPowerShellSingleQuotedString(companyEnvPath)}`,
    '$names = @("JAVA_HOME", "Path", "PATH")',
    'Get-ChildItem Env: | Where-Object { $_.Name -like "YGT_*" -or $names -contains $_.Name } | ForEach-Object { [pscustomobject]@{ name = $_.Name; value = $_.Value } } | ConvertTo-Json -Compress',
  ].join('; ');

  const result = spawnSync(executable, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: process.env,
    windowsHide: true,
  });

  if (result.error || result.status !== 0 || !result.stdout.trim()) return;

  try {
    const parsed = JSON.parse(result.stdout.trim());
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    for (const entry of entries) {
      if (entry?.name && typeof entry.value === 'string') {
        process.env[entry.name] = entry.value;
      }
    }
    process.env.YGT_HARNESS_ENV_BOOTSTRAPPED = '1';
  } catch {
    // Keep harness commands usable even when local PowerShell env output is malformed.
  }
}

function bootstrapCompanyEnvironmentReference() {
  if (process.env.YGT_HARNESS_SKIP_COMPANY_REFERENCE === '1') return;

  const referencePath = findCompanyEnvironmentReference();
  if (!referencePath) return;

  const discovered = parseYgtCompanyEnvironmentReference(readTextIfExists(referencePath) ?? '');
  for (const [name, value] of Object.entries(discovered)) {
    if (value && !process.env[name]) {
      process.env[name] = value;
    }
  }

  if (Object.keys(discovered).length > 0 && !process.env.YGT_COMPANY_REFERENCE_PATH) {
    process.env.YGT_COMPANY_REFERENCE_PATH = referencePath;
  }
}

function findCompanyEnvironmentReference() {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const referenceParts = ['dfhis-company-environment', 'references', 'company-environment', '医共体公司开发环境信息.md'];
  const candidates = [
    home ? resolve(home, '.agents', 'skills', ...referenceParts) : null,
    home ? resolve(home, '.codex', 'skills', ...referenceParts) : null,
    home ? resolve(home, '.claude', 'skills', ...referenceParts) : null,
    resolve(repoRoot, '..', '..', '..', '.agents', 'skills', ...referenceParts),
    resolve(repoRoot, '..', '..', '..', '.codex', 'skills', ...referenceParts),
    resolve(repoRoot, '..', '..', '..', '.claude', 'skills', ...referenceParts),
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function parseYgtCompanyEnvironmentReference(text) {
  const normalized = text.replace(/\r/g, '').replace(/\u00a0/g, ' ').replace(/\\_/g, '_');
  const values = {};

  setSlashCredential(values, 'YGT_MAIN_USER', 'YGT_MAIN_PASSWORD', sectionFor(normalized, '主应用'));
  setLineCredentials(values, 'YGT_GATEWAY_USER', 'YGT_GATEWAY_PASSWORD', sectionFor(normalized, '公司开发环境网关管理'));
  setLineCredentials(values, 'YGT_NACOS_USER', 'YGT_NACOS_PASSWORD', sectionFor(normalized, '公司开发环境nacos信息'));
  setSlashCredential(values, 'YGT_DORIS_USER', 'YGT_DORIS_PASSWORD', sectionFor(normalized, '公司开发环境数据库doris信息'));
  setSlashCredential(values, 'YGT_JENKINS_USER', 'YGT_JENKINS_PASSWORD', sectionFor(normalized, '公司开发环境jekins') || sectionFor(normalized, '公司开发环境jenkins'));

  return Object.fromEntries(Object.entries(values).filter(([, value]) => value && !/[<>]/.test(value)));
}

function sectionFor(text, heading) {
  const start = text.toLowerCase().indexOf(heading.toLowerCase());
  if (start === -1) return '';
  const rest = text.slice(start);
  const next = rest.slice(1).search(/\n\s*\*\*/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

function setSlashCredential(values, userKey, passwordKey, section) {
  // Why: the user segment must be colon-free so JDBC-style `host:port/db` lines
  // are not mistaken for `user/password` credentials.
  const line = credentialLines(section).find((entry) => /^[^/\s:]+\/[^/\s]+$/.test(entry));
  if (!line) return;
  const [user, password] = line.split('/');
  values[userKey] = user;
  values[passwordKey] = password;
}

function setLineCredentials(values, userKey, passwordKey, section) {
  // Why: exclude both colon widths so section headings like `网关管理：` are not
  // picked up as a username line.
  const lines = credentialLines(section).filter((line) => !line.includes(':') && !line.includes('：'));
  if (lines.length < 2) return;
  values[userKey] = lines[0];
  values[passwordKey] = lines[1];
}

function credentialLines(section) {
  return section
    .split(/\n+/)
    .map((line) => line.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*/g, '').trim())
    .filter((line) => line && !/^#+\s*/.test(line))
    .filter((line) => !/^[-*]\s*$/.test(line))
    .filter((line) => !/^https?:\/\//i.test(line) && !/https?:\/\//i.test(line))
    .filter((line) => !line.startsWith('$') && !/^mvn\b/i.test(line));
}

function toPowerShellSingleQuotedString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function trimSlash(value) {
  return value.replace(/\/+$/, '');
}

function shellQuote(value) {
  return String(value).replace(/[^A-Za-z0-9_.:-]/g, '');
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

async function run(command, commandArgs, options = {}) {
  log(`$ ${[command, ...commandArgs].join(' ')}`);
  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: shouldUseWindowsCommandShell(command),
      stdio: 'inherit',
    });

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Command timed out: ${command}`));
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on('exit', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`Command failed (${code}): ${command}`));
      }
    });
  });
}

async function capture(command, commandArgs, options = {}) {
  const result = await captureResult(command, commandArgs, options);
  if (result.code === 0) {
    return result.stdout;
  }
  throw new Error(result.stderr || `Command failed (${result.code}): ${command}`);
}

async function captureResult(command, commandArgs, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: shouldUseWindowsCommandShell(command),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    const timeout = options.timeoutMs
      ? setTimeout(() => {
        child.kill();
        reject(new Error(`Command timed out: ${command}`));
      }, options.timeoutMs)
      : null;
    child.on('error', reject);
    child.on('exit', (code) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      resolvePromise({ code, stdout, stderr });
    });
  });
}

function shouldUseWindowsCommandShell(command) {
  return process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(command);
}

function section(title) {
  console.log(`\n== ${title} ==`);
}

function log(message) {
  console.log(message);
}

function ok(message) {
  console.log(`OK ${message}`);
}

function fail(message) {
  console.error(`ERROR ${message}`);
  process.exitCode = 1;
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
