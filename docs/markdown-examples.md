# Markdown Extension Examples

======

# Spreadsheet Component — Full Feature Test

This page exercises every feature of the `<Spreadsheet>` component family.

---

## 1 · Basic multi-sheet workbook with column definitions

<Spreadsheet title="Employee Records">
  <Sheet name="Staff" color="#1a73e8" :max-rows="6">
    <SCols>
      <SCol width="60px" />
      <SCol width="140px" highlight />
      <SCol width="140px" />
      <SCol width="90px" />
      <SCol width="110px" highlight />
      <SCol width="80px" />
    </SCols>
    <SRow variant="header">
      <SCell align="center" bold>ID</SCell>
      <SCell bold>First Name</SCell>
      <SCell bold>Last Name</SCell>
      <SCell bold>Department</SCell>
      <SCell bold>Start Date</SCell>
      <SCell bold type="number">Salary</SCell>
    </SRow>
    <SRow>
      <SCell align="center">001</SCell>
      <SCell>Alice</SCell>
      <SCell>Müller</SCell>
      <SCell>Engineering</SCell>
      <SCell>2021-03-15</SCell>
      <SCell type="number">92 000</SCell>
    </SRow>
    <SRow>
      <SCell align="center">002</SCell>
      <SCell>Bob</SCell>
      <SCell>Tanaka</SCell>
      <SCell>Design</SCell>
      <SCell>2020-07-01</SCell>
      <SCell type="number">78 000</SCell>
    </SRow>
    <SRow highlight>
      <SCell align="center">003</SCell>
      <SCell>Carol</SCell>
      <SCell>Osei</SCell>
      <SCell>Engineering</SCell>
      <SCell>2019-11-22</SCell>
      <SCell type="number">105 000</SCell>
    </SRow>
    <SRow>
      <SCell align="center">004</SCell>
      <SCell>David</SCell>
      <SCell>Santos</SCell>
      <SCell>Marketing</SCell>
      <SCell>2022-01-10</SCell>
      <SCell type="number">67 000</SCell>
    </SRow>
    <SRow>
      <SCell align="center">005</SCell>
      <SCell>Eva</SCell>
      <SCell>Bergström</SCell>
      <SCell>Design</SCell>
      <SCell>2023-06-30</SCell>
      <SCell type="number">71 000</SCell>
    </SRow>
    <SRow>
      <SCell align="center">006</SCell>
      <SCell>Frank</SCell>
      <SCell>Nguyen</SCell>
      <SCell>Engineering</SCell>
      <SCell>2018-09-14</SCell>
      <SCell type="number">118 000</SCell>
    </SRow>
    <SRow>
      <SCell align="center">007</SCell>
      <SCell>Grace</SCell>
      <SCell>Patel</SCell>
      <SCell>Marketing</SCell>
      <SCell>2021-12-05</SCell>
      <SCell type="number">69 500</SCell>
    </SRow>
  </Sheet>

  <Sheet name="Departments" color="#34a853">
    <SCols>
      <SCol width="140px" />
      <SCol width="80px" />
      <SCol width="110px" />
    </SCols>
    <SRow variant="header">
      <SCell bold>Department</SCell>
      <SCell bold type="number">Head Count</SCell>
      <SCell bold type="number">Avg Salary</SCell>
    </SRow>
    <SRow>
      <SCell>Engineering</SCell>
      <SCell type="number">3</SCell>
      <SCell type="number">105 000</SCell>
    </SRow>
    <SRow>
      <SCell>Design</SCell>
      <SCell type="number">2</SCell>
      <SCell type="number">74 500</SCell>
    </SRow>
    <SRow>
      <SCell>Marketing</SCell>
      <SCell type="number">2</SCell>
      <SCell type="number">68 250</SCell>
    </SRow>
    <SRow variant="total">
      <SCell bold>Total</SCell>
      <SCell bold type="number">7</SCell>
      <SCell bold type="number">85 786</SCell>
    </SRow>
  </Sheet>
</Spreadsheet>

---

## 2 · Striped rows + scrollable area + frozen first column

<Spreadsheet title="Monthly Sales by Region">
  <Sheet name="Sales Q1" color="#ea4335" striped :max-rows="5" :max-cols="6">
    <SCols>
      <SCol width="130px" />
      <SCol width="90px" />
      <SCol width="90px" />
      <SCol width="90px" />
      <SCol width="90px" />
      <SCol width="90px" />
      <SCol width="90px" />
      <SCol width="90px" />
    </SCols>
    <SRow variant="header">
      <SCell bold>Region</SCell>
      <SCell bold type="number">Jan</SCell>
      <SCell bold type="number">Feb</SCell>
      <SCell bold type="number">Mar</SCell>
      <SCell bold type="number">Apr</SCell>
      <SCell bold type="number">May</SCell>
      <SCell bold type="number">Jun</SCell>
      <SCell bold type="number">Jul</SCell>
    </SRow>
    <SRow>
      <SCell>North America</SCell>
      <SCell type="number">12 450</SCell>
      <SCell type="number">13 200</SCell>
      <SCell type="number">15 800</SCell>
      <SCell type="number">14 100</SCell>
      <SCell type="number">16 300</SCell>
      <SCell type="number">18 500</SCell>
      <SCell type="number">17 900</SCell>
    </SRow>
    <SRow>
      <SCell>Europe</SCell>
      <SCell type="number">9 800</SCell>
      <SCell type="number">10 100</SCell>
      <SCell type="number">11 400</SCell>
      <SCell type="number">10 700</SCell>
      <SCell type="number">12 900</SCell>
      <SCell type="number">14 200</SCell>
      <SCell type="number">13 600</SCell>
    </SRow>
    <SRow>
      <SCell>Asia Pacific</SCell>
      <SCell type="number">7 600</SCell>
      <SCell type="number">8 300</SCell>
      <SCell type="number">9 100</SCell>
      <SCell type="number">8 900</SCell>
      <SCell type="number">10 400</SCell>
      <SCell type="number">11 800</SCell>
      <SCell type="number">12 100</SCell>
    </SRow>
    <SRow>
      <SCell>Latin America</SCell>
      <SCell type="number">3 200</SCell>
      <SCell type="number">3 400</SCell>
      <SCell type="number">3 900</SCell>
      <SCell type="number">3 700</SCell>
      <SCell type="number">4 100</SCell>
      <SCell type="number">4 600</SCell>
      <SCell type="number">4 800</SCell>
    </SRow>
    <SRow>
      <SCell>Middle East</SCell>
      <SCell type="number">2 100</SCell>
      <SCell type="number">2 300</SCell>
      <SCell type="number">2 700</SCell>
      <SCell type="number">2 500</SCell>
      <SCell type="number">2 900</SCell>
      <SCell type="number">3 200</SCell>
      <SCell type="number">3 100</SCell>
    </SRow>
    <SRow>
      <SCell>Africa</SCell>
      <SCell type="number">1 400</SCell>
      <SCell type="number">1 500</SCell>
      <SCell type="number">1 700</SCell>
      <SCell type="number">1 600</SCell>
      <SCell type="number">1 800</SCell>
      <SCell type="number">2 000</SCell>
      <SCell type="number">2 100</SCell>
    </SRow>
  </Sheet>
</Spreadsheet>

---

## 3 · Empty row breaks + empty column breaks + notes

<Spreadsheet title="XLSForm Survey Sheet">
  
  <Sheet name="survey" :max-rows="6">
    <SCols>
      <SCol width="160px" />
      <SCol width="130px" />
      <SCol width="220px" />
      <SCol empty="5" />
      <SCol width="100px" />
      <SCol width="180px" />
    </SCols>

  <SRow variant="header">
    <SCell bold>type</SCell>
    <SCell bold>name</SCell>
    <SCell bold>label</SCell>
    <SCell empty="2" />
    <SCell bold>required</SCell>
    <SCell bold>constraint</SCell>
  </SRow>

  <!-- Group: Demographics -->
  <SRow variant="groupLabel">
    <SCell :colspan="3" bold italic color="#555">Demographics</SCell>
    <SCell empty="3" />
    <SCell /><SCell />
  </SRow>

  <SRow>
    <SCell note="The `today` type silently captures the submission date. No UI widget is shown to the respondent.">today</SCell>
    <SCell>today</SCell>
    <SCell />
    <SCell empty="4" />
    <SCell /><SCell />
  </SRow>
  <SRow>
    <SCell note="Use `select_one` when exactly one choice must be selected.\n\nThe list name `gender` must match a list in the **choices** sheet.">select_one gender</SCell>
    <SCell>gender</SCell>
    <SCell>Respondent's gender?</SCell>
    <SCell empty="2" />
    <SCell align="center">yes</SCell>
    <SCell />
  </SRow>
  <SRow>
    <SCell type="formula">integer</SCell>
    <SCell>age</SCell>
    <SCell>Respondent's age?</SCell>
    <SCell empty="3" />
    <SCell align="center">yes</SCell>
    <SCell type="formula">. >= 0 and . <= 120</SCell>
  </SRow>

  <!-- Visual break between sections -->
  <SRow empty="6" />

  <!-- Group: Location -->
  <SRow variant="groupLabel">
    <SCell :colspan="3" bold italic color="#555">Location</SCell>
    <SCell empty="2" />
    <SCell /><SCell />
  </SRow>

  <SRow>
    <SCell>text</SCell>
    <SCell>store_name</SCell>
    <SCell>What is the name of the store?</SCell>
    <SCell empty="5" />
    <SCell align="center">yes</SCell>
    <SCell />
  </SRow>
  <SRow highlight>
    <SCell note="Requires GPS hardware on the device.\n\nSee `capture-accuracy` parameter to set threshold.">geopoint</SCell>
    <SCell>store_gps</SCell>
    <SCell>Collect GPS coordinates of the store.</SCell>
    <SCell empty="4" />
    <SCell align="center" highlight>yes</SCell>
    <SCell />
  </SRow>

  <!-- Visual break -->
  <SRow empty="3" />

  <!-- Group: Media -->
  <SRow variant="groupLabel">
    <SCell :colspan="3" bold italic color="#555">Media</SCell>
    <SCell empty="4" />
    <SCell /><SCell />
  </SRow>

  <SRow>
    <SCell>image</SCell>
    <SCell>store_photo</SCell>
    <SCell>Take a photo of the storefront.</SCell>
    <SCell empty="5" />
    <SCell align="center">no</SCell>
    <SCell />
  </SRow>

  </Sheet>

  <Sheet name="choices">
    <SCols>
      <SCol width="120px" />
      <SCol width="100px" />
      <SCol width="160px" />
    </SCols>
    <SRow variant="header">
      <SCell bold>list_name</SCell>
      <SCell bold>name</SCell>
      <SCell bold>label</SCell>
    </SRow>
    <SRow>
      <SCell>gender</SCell><SCell>transgender</SCell><SCell>Transgender</SCell>
    </SRow>
    <SRow>
      <SCell>gender</SCell><SCell>female</SCell><SCell>Female</SCell>
    </SRow>
    <SRow>
      <SCell>gender</SCell><SCell>male</SCell><SCell>Male</SCell>
    </SRow>
    <SRow>
      <SCell>gender</SCell><SCell>other</SCell><SCell>Prefer not to say</SCell>
    </SRow>
  </Sheet>
</Spreadsheet>

---

## 4 · Formula cells, number alignment, colspan/rowspan, many sheets

<Spreadsheet title="Budget Model">

  <Sheet name="Income" color="#0f9d58">
    <SCols>
      <SCol width="180px" />
      <SCol width="100px" />
      <SCol width="100px" />
      <SCol width="100px" />
      <SCol width="100px" />
    </SCols>
    <SRow variant="header">
      <SCell bold>Line Item</SCell>
      <SCell bold type="number">Q1</SCell>
      <SCell bold type="number">Q2</SCell>
      <SCell bold type="number">Q3</SCell>
      <SCell bold type="number">Q4</SCell>
    </SRow>
    <SRow>
      <SCell note="Recurring monthly contracts.\nRenewed automatically each year.">Subscription Revenue</SCell>
      <SCell type="number">42 000</SCell>
      <SCell type="number">45 500</SCell>
      <SCell type="number">48 200</SCell>
      <SCell type="number">51 000</SCell>
    </SRow>
    <SRow>
      <SCell>Professional Services</SCell>
      <SCell type="number">18 000</SCell>
      <SCell type="number">22 000</SCell>
      <SCell type="number">19 500</SCell>
      <SCell type="number">25 000</SCell>
    </SRow>
    <SRow>
      <SCell>Licence Fees</SCell>
      <SCell type="number">5 000</SCell>
      <SCell type="number">5 000</SCell>
      <SCell type="number">7 500</SCell>
      <SCell type="number">7 500</SCell>
    </SRow>
    <SRow empty="2" />
    <SRow variant="total">
      <SCell bold>Total Income</SCell>
      <SCell bold type="formula">=SUM(B2:B4)</SCell>
      <SCell bold type="formula">=SUM(C2:C4)</SCell>
      <SCell bold type="formula">=SUM(D2:D4)</SCell>
      <SCell bold type="formula">=SUM(E2:E4)</SCell>
    </SRow>
  </Sheet>

  <Sheet name="Expenses" color="#fbbc04">
    <SCols>
      <SCol width="180px" />
      <SCol width="100px" />
      <SCol width="100px" />
      <SCol width="100px" />
      <SCol width="100px" />
    </SCols>
    <SRow variant="header">
      <SCell bold>Line Item</SCell>
      <SCell bold type="number">Q1</SCell>
      <SCell bold type="number">Q2</SCell>
      <SCell bold type="number">Q3</SCell>
      <SCell bold type="number">Q4</SCell>
    </SRow>
    <SRow>
      <SCell>Salaries</SCell>
      <SCell type="number">30 000</SCell>
      <SCell type="number">30 000</SCell>
      <SCell type="number">32 000</SCell>
      <SCell type="number">32 000</SCell>
    </SRow>
    <SRow>
      <SCell>Infrastructure</SCell>
      <SCell type="number">8 500</SCell>
      <SCell type="number">8 500</SCell>
      <SCell type="number">9 200</SCell>
      <SCell type="number">9 200</SCell>
    </SRow>
    <SRow>
      <SCell highlight note="Spike due to planned conference in Q3.">Marketing</SCell>
      <SCell type="number">4 000</SCell>
      <SCell type="number">4 000</SCell>
      <SCell type="number" highlight>12 000</SCell>
      <SCell type="number">5 000</SCell>
    </SRow>
    <SRow>
      <SCell>R&amp;D</SCell>
      <SCell type="number">6 000</SCell>
      <SCell type="number">7 500</SCell>
      <SCell type="number">7 500</SCell>
      <SCell type="number">9 000</SCell>
    </SRow>
    <SRow empty="3" />
    <SRow variant="total">
      <SCell bold>Total Expenses</SCell>
      <SCell bold type="formula">=SUM(B2:B5)</SCell>
      <SCell bold type="formula">=SUM(C2:C5)</SCell>
      <SCell bold type="formula">=SUM(D2:D5)</SCell>
      <SCell bold type="formula">=SUM(E2:E5)</SCell>
    </SRow>
  </Sheet>

  <Sheet name="Summary" color="#9c27b0">
    <SCols>
      <SCol width="180px" />
      <SCol width="120px" />
    </SCols>
    <SRow variant="header">
      <SCell bold :colspan="2" align="center">Annual Summary</SCell>
    </SRow>
    <SRow>
      <SCell bold>Total Income</SCell>
      <SCell type="formula">=Income!B6+Income!C6+Income!D6+Income!E6</SCell>
    </SRow>
    <SRow>
      <SCell bold>Total Expenses</SCell>
      <SCell type="formula">=Expenses!B7+Expenses!C7+Expenses!D7+Expenses!E7</SCell>
    </SRow>
    <SRow empty="13" />
    <SRow highlight>
      <SCell bold highlight>Net Profit</SCell>
      <SCell bold type="formula" highlight>=B2-B3</SCell>
    </SRow>
  </Sheet>

  <Sheet name="Notes" color="#607d8b">
    <SCols>
      <SCol width="320px" />
    </SCols>
    <SRow variant="header">
      <SCell bold>Assumptions &amp; Notes</SCell>
    </SRow>
    <SRow>
      <SCell>All figures in USD. FY starts January.</SCell>
    </SRow>
    <SRow>
      <SCell>Growth rate assumed at 8% YoY for subscriptions.</SCell>
    </SRow>
    <SRow>
      <SCell italic color="#888">Last updated: 2025-01-15</SCell>
    </SRow>
  </Sheet>

</Spreadsheet>

---

## 5 · Colspan & rowspan demonstration

<Spreadsheet title="Merged Cells Demo">
  <Sheet name="merge-test">
    <SCols>
      <SCol width="140px" />
      <SCol width="100px" />
      <SCol width="100px" />
      <SCol width="100px" />
    </SCols>
    <!-- Spanning header -->
    <SRow variant="header">
      <SCell bold>Category</SCell>
      <SCell bold :colspan="3" align="center">Values (Jan · Feb · Mar)</SCell>
    </SRow>
    <!-- rowspan on the first cell -->
    <SRow>
      <SCell bold :rowspan="2" align="center" bg="#f0f4ff" color="#1a73e8">Group A</SCell>
      <SCell type="number">100</SCell>
      <SCell type="number">110</SCell>
      <SCell type="number">120</SCell>
    </SRow>
    <SRow>
      <!-- no first cell — rowspan covers it -->
      <SCell type="number">200</SCell>
      <SCell type="number">210</SCell>
      <SCell type="number">220</SCell>
    </SRow>
    <SRow>
      <SCell bold :rowspan="2" align="center" bg="#fff4f0" color="#c0392b">Group B</SCell>
      <SCell type="number">300</SCell>
      <SCell type="number">310</SCell>
      <SCell type="number">320</SCell>
    </SRow>
    <SRow>
      <SCell type="number">400</SCell>
      <SCell type="number">410</SCell>
      <SCell type="number">420</SCell>
    </SRow>
  </Sheet>
</Spreadsheet>

---

## 6 · Tab colours + many tabs (overflow scrolling test)

<Spreadsheet title="Multi-tab Overflow Test">
  <Sheet name="Jan" color="#e53935"><SRow><SCell>January data</SCell></SRow></Sheet>
  <Sheet name="Feb" color="#e67c13"><SRow><SCell>February data</SCell></SRow></Sheet>
  <Sheet name="Mar" color="#f9a825"><SRow><SCell>March data</SCell></SRow></Sheet>
  <Sheet name="Apr" color="#2e7d32"><SRow><SCell>April data</SCell></SRow></Sheet>
  <Sheet name="May" color="#00838f"><SRow><SCell>May data</SCell></SRow></Sheet>
  <Sheet name="Jun" color="#1565c0"><SRow><SCell>June data</SCell></SRow></Sheet>
  <Sheet name="Jul" color="#6a1b9a"><SRow><SCell>July data</SCell></SRow></Sheet>
  <Sheet name="Aug" color="#ad1457"><SRow><SCell>August data</SCell></SRow></Sheet>
  <Sheet name="Sep" color="#558b2f"><SRow><SCell>September data</SCell></SRow></Sheet>
  <Sheet name="Oct" color="#4e342e"><SRow><SCell>October data</SCell></SRow></Sheet>
  <Sheet name="Nov" color="#37474f"><SRow><SCell>November data</SCell></SRow></Sheet>
  <Sheet name="Dec" color="#263238"><SRow><SCell>December data</SCell></SRow></Sheet>
</Spreadsheet>

======

This page demonstrates some of the built-in markdown extensions provided by VitePress.

## Syntax Highlighting

VitePress provides Syntax Highlighting powered by [Shiki](https://github.com/shikijs/shiki), with additional features like line-highlighting:

**Input**

````md
```js{4}
export default {
  data () {
    return {
      msg: 'Highlighted!'
    }
  }
}
```
````

**Output**

```js{4}
export default {
  data () {
    return {
      msg: 'Highlighted!'
    }
  }
}
```

## Custom Containers

**Input**

```md
::: info
This is an info box.
:::

::: tip
This is a tip.
:::

::: warning
This is a warning.
:::

::: danger
This is a dangerous warning.
:::

::: details
This is a details block.
:::
```

**Output**

::: info
This is an info box.
:::

::: tip
This is a tip.
:::

::: warning
This is a warning.
:::

::: danger
This is a dangerous warning.
:::

::: details
This is a details block.
:::

## More

Check out the documentation for the [full list of markdown extensions](https://vitepress.dev/guide/markdown).
