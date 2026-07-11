import { describe, expect, it } from "vitest";

import {
  mapRdlDataSource,
  parseRdlXml,
  rdlNeedsManualReview,
  rdlToReportDefinition,
} from "@/lib/reports/rdl-parser";
import {
  isReportParameterRequired,
  validateSubmittedParameters,
} from "@/lib/reports/parameter-utils";
import { validateReportDefinition } from "@/lib/reports/validate";

const SAMPLE_RDL = `<?xml version="1.0" encoding="utf-8"?>
<Report Name="TestReport">
  <DataSources>
    <DataSource Name="DS1"><ConnectionProperties><DataProvider>SQL</DataProvider></ConnectionProperties></DataSource>
  </DataSources>
  <DataSets>
    <DataSet Name="Main">
      <Query><DataSourceName>DS1</DataSourceName><CommandText>SELECT Id, Name FROM Items WHERE @P1 = @P1</CommandText></Query>
      <Fields>
        <Field Name="Id"><DataField>Id</DataField></Field>
        <Field Name="Name"><DataField>Name</DataField></Field>
      </Fields>
    </DataSet>
  </DataSets>
  <ReportParameters>
    <ReportParameter Name="P1"><DataType>String</DataType><Prompt>Param</Prompt></ReportParameter>
  </ReportParameters>
</Report>`;

describe("rdl-parser", () => {
  it("parses basic RDL", () => {
    const parsed = parseRdlXml(SAMPLE_RDL, "test.rdl");
    expect(parsed.name).toBeTruthy();
    expect(parsed.datasets).toHaveLength(1);
    expect(parsed.parameters[0]?.name).toBe("P1");
  });

  it("maps datasource names", () => {
    expect(mapRdlDataSource(["Rahkaran"])).toBe("rahkaran");
    expect(mapRdlDataSource(["unknown-db"])).toBe("rahkaran");
  });

  it("uses field names as column headers when no layout labels", () => {
    const parsed = parseRdlXml(SAMPLE_RDL, "test.rdl");
    const def = rdlToReportDefinition(parsed, {
      slug: "test-report",
      moduleId: "imported",
      nameFa: "تست",
    });
    expect(def.datasets[0]?.columns[0]?.header).toBeTruthy();
  });

  it("converts to report definition", () => {
    const parsed = parseRdlXml(SAMPLE_RDL, "test.rdl");
    const def = rdlToReportDefinition(parsed, {
      slug: "test-report",
      moduleId: "imported",
      nameFa: "تست",
    });
    expect(def.id).toBe("test-report");
    expect(def.datasets.length).toBeGreaterThan(0);
    expect(def.parameters.some((p) => p.name === "P1")).toBe(true);
  });

  it("flags manual review for empty SQL", () => {
    const parsed = parseRdlXml(SAMPLE_RDL, "test.rdl");
    parsed.datasets[0]!.sql = "";
    expect(rdlNeedsManualReview(parsed)).toBe(true);
  });
});

describe("parameter-utils", () => {
  it("validates required parameters", () => {
    const result = validateSubmittedParameters(
      [
        {
          name: "YEAR",
          label: "سال",
          type: "number",
          required: true,
        },
      ],
      {},
    );
    expect(result.ok).toBe(false);
  });

  it("detects required flag", () => {
    expect(
      isReportParameterRequired({
        name: "X",
        label: "X",
        type: "text",
        nullable: false,
      }),
    ).toBe(true);
  });
});

describe("validate", () => {
  it("rejects empty definition", () => {
    const result = validateReportDefinition({
      id: "",
      nameFa: "",
      moduleId: "m",
      parameters: [],
      datasets: [],
      columns: [],
    });
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});
