import { prisma } from "@/lib/prisma";
import { createProject } from "@/lib/projects";
import { createScenario } from "@/lib/scenarios";
import { createTestGroup } from "@/lib/test-groups";
import { createTestCase, updateAssignee, updateTestResultAndNotes } from "@/lib/test-cases";
import type { Priority, TestResult, WorkflowStatus } from "@/generated/prisma/client";

type TestCaseSeed = {
  code: string;
  name: string;
  preconditions?: string;
  /** Ordered action lines. Omitted when the case description gives no explicit steps —
   * a single generic step is used instead, since every Test Case needs at least one. */
  steps?: string[];
  /** Bullet list of expected outcomes, joined into one string for both the Test Case's
   * own `expectedResult` and every one of its Test Steps (the schema requires each
   * TestStep to carry its own expectedResult; there's no finer-grained mapping from
   * the source mockup, which only lists outcomes once per case). */
  expectedResults: string[];
  priority: Priority;
  testResult?: TestResult;
  assignToSeedUser?: boolean;
};

type TestGroupSeed = {
  name: string;
  testObjective: string;
  status: WorkflowStatus;
  testCases: TestCaseSeed[];
};

type ScenarioSeed = {
  name: string;
  description: string;
  preconditions: string;
  expectedResult: string;
  priority: Priority;
  status: WorkflowStatus;
  testGroups: TestGroupSeed[];
};

const SCENARIOS: ScenarioSeed[] = [
  {
    name: "ผู้ใช้เข้าสู่ระบบด้วย Username และ Password",
    description:
      "ผู้ใช้สามารถกรอกข้อมูลเข้าสู่ระบบ และระบบตรวจสอบข้อมูลเพื่ออนุญาตหรือปฏิเสธการเข้าใช้งานได้อย่างถูกต้อง",
    preconditions: "ผู้ใช้อยู่ที่หน้า Login",
    expectedResult:
      "เมื่อข้อมูลถูกต้อง ผู้ใช้เข้าสู่ระบบและไปยังหน้าหลักได้ หากข้อมูลไม่ถูกต้องหรือไม่ครบ ระบบต้องไม่อนุญาตให้เข้าสู่ระบบและแสดงข้อความที่เหมาะสม",
    priority: "CRITICAL",
    status: "READY",
    testGroups: [
      {
        name: "Navigation",
        testObjective: "การเข้าหน้า Login และการเปลี่ยนหน้า",
        status: "READY",
        testCases: [
          {
            code: "TC-LOGIN-NAV-001",
            name: "เปิดหน้า Login",
            steps: ["เปิด URL ของระบบ"],
            expectedResults: ["ระบบแสดงหน้า Login", "แสดง Username", "แสดง Password", "แสดงปุ่ม Login"],
            priority: "HIGH",
            testResult: "PASSED",
          },
          {
            code: "TC-LOGIN-NAV-002",
            name: "Login สำเร็จแล้ว Navigate ไปหน้าหลัก",
            preconditions: "มี User ที่สามารถใช้งานระบบได้",
            steps: ["กรอก Username ที่ถูกต้อง", "กรอก Password ที่ถูกต้อง", "คลิก Login"],
            expectedResults: ["ระบบเข้าสู่ระบบสำเร็จ", "Navigate ไปยังหน้า Dashboard / Home"],
            priority: "CRITICAL",
            testResult: "PASSED",
          },
          {
            code: "TC-LOGIN-NAV-003",
            name: "ผู้ใช้ที่ Login แล้วเปิดหน้า Login",
            preconditions: "ผู้ใช้ Login อยู่แล้ว",
            steps: ["เปิด URL หน้า Login"],
            expectedResults: ["ระบบไม่แสดงหน้า Login ซ้ำ", "Redirect ไปยังหน้าหลัก"],
            priority: "MEDIUM",
          },
        ],
      },
      {
        name: "Input",
        testObjective: "Username / Password",
        status: "READY",
        testCases: [
          {
            code: "TC-LOGIN-INP-001",
            name: "กรอก Username",
            steps: ["คลิกช่อง Username", "กรอก Username"],
            expectedResults: ["ระบบสามารถรับค่าที่กรอกได้", "แสดงค่าที่กรอกในช่อง Username"],
            priority: "MEDIUM",
            testResult: "PASSED",
          },
          {
            code: "TC-LOGIN-INP-002",
            name: "กรอก Password",
            steps: ["คลิกช่อง Password", "กรอก Password"],
            expectedResults: ["ระบบสามารถรับค่าที่กรอกได้", "Password ถูก Mask"],
            priority: "MEDIUM",
            testResult: "PASSED",
          },
          {
            code: "TC-LOGIN-INP-003",
            name: "แก้ไข Username",
            steps: ["กรอก Username", "แก้ไขค่าที่กรอก"],
            expectedResults: ["ระบบแสดงค่าล่าสุดที่ผู้ใช้แก้ไข"],
            priority: "LOW",
          },
          {
            code: "TC-LOGIN-INP-004",
            name: "ลบ Password",
            steps: ["กรอก Password", "ลบ Password ทั้งหมด"],
            expectedResults: ["ช่อง Password กลับเป็นค่าว่าง"],
            priority: "LOW",
          },
        ],
      },
      {
        name: "Button",
        testObjective: "ปุ่ม Login และปุ่มอื่น",
        status: "IN_PROGRESS",
        testCases: [
          {
            code: "TC-LOGIN-BTN-001",
            name: "คลิก Login",
            steps: ["กรอก Username", "กรอก Password", "คลิก Login"],
            expectedResults: ["ระบบส่งข้อมูลเพื่อทำ Authentication"],
            priority: "HIGH",
            testResult: "PASSED",
          },
          {
            code: "TC-LOGIN-BTN-002",
            name: "กด Enter เพื่อ Login",
            steps: ["กรอก Username", "กรอก Password", "กด Enter"],
            expectedResults: ["ระบบทำงานเหมือนการคลิกปุ่ม Login"],
            priority: "MEDIUM",
            testResult: "FAILED",
            assignToSeedUser: true,
          },
          {
            code: "TC-LOGIN-BTN-003",
            name: "ปุ่ม Show Password",
            preconditions: "กรณี UI มีปุ่มรูปดวงตา (Show Password)",
            steps: ["กรอก Password", "คลิก Show Password"],
            expectedResults: ["ระบบแสดง Password เป็นข้อความ"],
            priority: "LOW",
          },
          {
            code: "TC-LOGIN-BTN-004",
            name: "ปุ่ม Hide Password",
            steps: ["เปิด Show Password", "คลิก Hide Password"],
            expectedResults: ["Password กลับมาแสดงแบบ Mask"],
            priority: "LOW",
          },
        ],
      },
      {
        name: "Validation",
        testObjective: "การตรวจสอบข้อมูลก่อน Submit",
        status: "IN_PROGRESS",
        testCases: [
          {
            code: "TC-LOGIN-VAL-001",
            name: "ไม่กรอก Username",
            steps: ["ไม่กรอก Username", "กรอก Password", "คลิก Login"],
            expectedResults: ["ระบบไม่อนุญาตให้ Login", "แสดง Validation ที่ Username"],
            priority: "HIGH",
            testResult: "PASSED",
          },
          {
            code: "TC-LOGIN-VAL-002",
            name: "ไม่กรอก Password",
            steps: ["กรอก Username", "ไม่กรอก Password", "คลิก Login"],
            expectedResults: ["ระบบไม่อนุญาตให้ Login", "แสดง Validation ที่ Password"],
            priority: "HIGH",
            testResult: "PASSED",
          },
          {
            code: "TC-LOGIN-VAL-003",
            name: "ไม่กรอก Username และ Password",
            steps: ["ปล่อย Username ว่าง", "ปล่อย Password ว่าง", "คลิก Login"],
            expectedResults: ["ระบบไม่อนุญาตให้ Login", "แสดง Validation ของทั้งสอง Field"],
            priority: "HIGH",
            testResult: "BLOCKED",
          },
          {
            code: "TC-LOGIN-VAL-004",
            name: "Validation หายหลังกรอกข้อมูล",
            steps: ["Trigger Validation ที่ Username", "กรอก Username"],
            expectedResults: ["Validation ของ Username หายเมื่อข้อมูลถูกต้องตามเงื่อนไข"],
            priority: "MEDIUM",
          },
        ],
      },
      {
        name: "Message",
        testObjective: "Error / Validation Message",
        status: "DRAFT",
        testCases: [
          {
            code: "TC-LOGIN-MSG-001",
            name: "Username หรือ Password ไม่ถูกต้อง",
            steps: ["กรอก Username หรือ Password ผิด", "คลิก Login"],
            expectedResults: [
              "ระบบแสดงข้อความแจ้งว่า Username หรือ Password ไม่ถูกต้อง",
              "ผู้ใช้ยังอยู่หน้า Login",
            ],
            priority: "HIGH",
            testResult: "PASSED",
          },
          {
            code: "TC-LOGIN-MSG-002",
            name: "Account ไม่มีสิทธิ์เข้าใช้งาน",
            preconditions: "Account ไม่มีสิทธิ์ใช้งานระบบ",
            steps: ["กรอกข้อมูล Account", "คลิก Login"],
            expectedResults: ["ระบบไม่อนุญาตให้ Login", "แสดงข้อความแจ้งสิทธิ์การเข้าใช้งาน"],
            priority: "HIGH",
          },
          {
            code: "TC-LOGIN-MSG-003",
            name: "Account ถูก Disable",
            preconditions: "User Status = Disabled",
            expectedResults: ["ระบบไม่อนุญาตให้ Login", "แสดงข้อความแจ้งสถานะ Account ตาม Requirement"],
            priority: "HIGH",
          },
          {
            code: "TC-LOGIN-MSG-004",
            name: "Server Error ขณะ Login",
            steps: ["ทำให้ Login API Error", "คลิก Login"],
            expectedResults: ["ระบบไม่ Navigate ออกจากหน้า Login", "แสดง Error Message"],
            priority: "MEDIUM",
            testResult: "BLOCKED",
          },
        ],
      },
      {
        name: "Authentication",
        testObjective: "การตรวจสอบ Username / Password",
        status: "READY",
        testCases: [
          {
            code: "TC-LOGIN-AUTH-001",
            name: "Username และ Password ถูกต้อง",
            expectedResults: ["Authentication สำเร็จ", "ผู้ใช้เข้าสู่ระบบได้"],
            priority: "CRITICAL",
            testResult: "PASSED",
          },
          {
            code: "TC-LOGIN-AUTH-002",
            name: "Username ถูก แต่ Password ผิด",
            expectedResults: ["Authentication ไม่สำเร็จ", "ไม่สร้าง Login Session"],
            priority: "CRITICAL",
            testResult: "PASSED",
          },
          {
            code: "TC-LOGIN-AUTH-003",
            name: "Username ไม่มีในระบบ",
            expectedResults: ["Authentication ไม่สำเร็จ", "ผู้ใช้ไม่สามารถเข้าสู่ระบบได้"],
            priority: "HIGH",
            testResult: "PASSED",
          },
          {
            code: "TC-LOGIN-AUTH-004",
            name: "Password ถูก แต่ Username ผิด",
            expectedResults: ["Authentication ไม่สำเร็จ", "ผู้ใช้ไม่สามารถเข้าสู่ระบบได้"],
            priority: "HIGH",
            testResult: "FAILED",
            assignToSeedUser: true,
          },
        ],
      },
      {
        name: "Security",
        testObjective: "Password masking / การกด Enter / Session",
        status: "DRAFT",
        testCases: [
          {
            code: "TC-LOGIN-SEC-001",
            name: "Password ถูก Mask เป็น Default",
            expectedResults: ["Password ต้องไม่แสดงเป็น Plain Text"],
            priority: "CRITICAL",
            testResult: "PASSED",
          },
          {
            code: "TC-LOGIN-SEC-002",
            name: "Password ไม่แสดงหลัง Reload หน้า",
            steps: ["กรอก Password", "Reload หน้า"],
            expectedResults: ["Password ไม่ถูกเก็บและแสดงกลับมาโดยอัตโนมัติ"],
            priority: "HIGH",
          },
          {
            code: "TC-LOGIN-SEC-003",
            name: "Login Failed แล้ว Password ไม่ควรเปิดเผย",
            steps: ["Login ด้วยข้อมูลผิด"],
            expectedResults: ["ระบบไม่แสดง Password ใน Error Message"],
            priority: "CRITICAL",
          },
          {
            code: "TC-LOGIN-SEC-004",
            name: "Session ถูกสร้างหลัง Login สำเร็จ",
            expectedResults: [
              "ระบบสร้าง Session / Token หลัง Authentication สำเร็จ",
              "ผู้ใช้สามารถเข้าหน้าที่ต้อง Login ได้",
            ],
            priority: "HIGH",
          },
        ],
      },
      {
        name: "UI Display",
        testObjective: "การแสดงองค์ประกอบของหน้า",
        status: "COMPLETED",
        testCases: [
          {
            code: "TC-LOGIN-UI-001",
            name: "แสดง Username Field",
            expectedResults: ["Username Field แสดงตาม Design"],
            priority: "LOW",
            testResult: "PASSED",
          },
          {
            code: "TC-LOGIN-UI-002",
            name: "แสดง Password Field",
            expectedResults: ["Password Field แสดงตาม Design"],
            priority: "LOW",
            testResult: "PASSED",
          },
          {
            code: "TC-LOGIN-UI-003",
            name: "แสดง Login Button",
            expectedResults: ["ปุ่ม Login แสดงตาม Design", "Label ถูกต้อง"],
            priority: "LOW",
            testResult: "PASSED",
          },
          {
            code: "TC-LOGIN-UI-004",
            name: "แสดง Placeholder",
            expectedResults: ["Username และ Password แสดง Placeholder ตามที่กำหนด"],
            priority: "LOW",
            testResult: "PASSED",
          },
        ],
      },
    ],
  },
];

/** Hard-deletes any existing Scenario/Test Group/Test Case tree for this Project so the seed can be re-run with fresh content (this is throwaway mockup data, not real user work). */
async function resetExistingMockupData(projectId: string) {
  const testCases = await prisma.testCase.findMany({
    where: { testGroup: { scenario: { projectId } } },
    select: { id: true },
  });
  const testCaseIds = testCases.map((tc) => tc.id);

  await prisma.attachment.deleteMany({ where: { testCaseId: { in: testCaseIds } } });
  await prisma.testStep.deleteMany({ where: { testCaseId: { in: testCaseIds } } });
  await prisma.testCase.deleteMany({ where: { id: { in: testCaseIds } } });
  await prisma.testGroup.deleteMany({ where: { scenario: { projectId } } });
  await prisma.scenario.deleteMany({ where: { projectId } });
  await prisma.auditLog.deleteMany({
    where: { projectId, entityType: { in: ["Scenario", "TestGroup", "TestCase"] } },
  });

  // The Requirement and Module the seeded Scenarios hang off. Removed after
  // the Scenarios above, which are what still reference them.
  await prisma.requirement.deleteMany({ where: { projectId, name: MOCKUP_REQUIREMENT_NAME } });
  await prisma.module.deleteMany({ where: { projectId, name: MOCKUP_MODULE_NAME } });
}

/** A Scenario needs a Requirement, which needs a Module, so the seed brings
 *  its own rather than attaching mockup data to real ones. */
const MOCKUP_MODULE_NAME = "Mockup";
const MOCKUP_REQUIREMENT_NAME = "Mockup requirements";

async function main() {
  const actor = await prisma.user.findFirstOrThrow({ select: { id: true } });

  const project =
    (await prisma.project.findUnique({ where: { code: "prom001" } })) ??
    (await createProject({ code: "prom001", name: "PROM", status: "ACTIVE" }, actor.id));

  await resetExistingMockupData(project.id);

  const mockupModule = await prisma.module.upsert({
    where: { projectId_name: { projectId: project.id, name: MOCKUP_MODULE_NAME } },
    update: { deletedAt: null },
    create: { projectId: project.id, name: MOCKUP_MODULE_NAME },
  });
  const mockupRequirement = await prisma.requirement.create({
    data: {
      projectId: project.id,
      moduleId: mockupModule.id,
      name: MOCKUP_REQUIREMENT_NAME,
      priority: "MEDIUM",
    },
  });

  for (const scenarioSeed of SCENARIOS) {
    const scenario = await createScenario(
      project.id,
      {
        requirementId: mockupRequirement.id,
        name: scenarioSeed.name,
        description: scenarioSeed.description,
        preconditions: scenarioSeed.preconditions,
        expectedResult: scenarioSeed.expectedResult,
        priority: scenarioSeed.priority,
        status: scenarioSeed.status,
      },
      actor.id,
    );

    for (const groupSeed of scenarioSeed.testGroups) {
      const testGroup = await createTestGroup(
        scenario.id,
        { name: groupSeed.name, testObjective: groupSeed.testObjective, status: groupSeed.status },
        actor.id,
      );

      for (const caseSeed of groupSeed.testCases) {
        const expectedResult = caseSeed.expectedResults.join("\n");
        const stepLines = caseSeed.steps && caseSeed.steps.length > 0 ? caseSeed.steps : ["ดำเนินการตามเงื่อนไขของเคสนี้"];

        const testCase = await createTestCase(
          testGroup.id,
          {
            name: `${caseSeed.code} ${caseSeed.name}`,
            preconditions: caseSeed.preconditions ?? null,
            expectedResult,
            priority: caseSeed.priority,
            steps: stepLines.map((step) => ({ step, expectedResult })),
          },
          actor.id,
        );

        if (caseSeed.testResult) {
          await updateTestResultAndNotes(testCase.id, { testResult: caseSeed.testResult }, actor.id);
        }
        if (caseSeed.assignToSeedUser) {
          await updateAssignee(testCase.id, actor.id, actor.id);
        }
      }
    }

    console.log(`Created scenario "${scenario.name}" with ${scenarioSeed.testGroups.length} test group(s).`);
  }

  console.log(`Done seeding "${project.name}" (${project.code}).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
