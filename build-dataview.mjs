// 在 Quartz 构建前，把 notes 里的 ```dataview``` 代码块求值成静态 Markdown 表格。
// 支持（与本库实际查询一致）：
//   A) TABLE cols FROM "<folder>" WHERE concept = "<X>" [SORT f ASC]
//   B) TABLE cols FROM "" WHERE contains(file.outlinks, [[X]])
//   C) TABLE cols FROM "<folder>" WHERE contains(file.outlinks, this.file.link)
//   D) TABLE WITHOUT ID cols FROM #tag WHERE file.name != "<X>"
// 不认识或含占位符（如 <概念名>）的块保持原样显示为代码，不破坏文档。
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import yaml from "js-yaml"
import { globby as globList } from "globby"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// 相对路径基：应含 "00-知识库" 前缀，与 dataview FROM "00-知识库/原子库" 对应，故取 content/ 作为库根
const rootBase = path.join(__dirname, "content")
const contentRoot = path.join(rootBase, "00-知识库")

function readFrontmatter(raw) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/m.exec(raw)
  if (!m) return {}
  try {
    return yaml.load(m[1]) ?? {}
  } catch {
    return {}
  }
}

function extractOutlinks(raw) {
  const out = new Set()
  const re = /\[\[([^\]|#]+)(?:#[^\]|]*)?\|?[^\]]*\]\]/g
  let mm
  while ((mm = re.exec(raw))) out.add(mm[1].trim())
  return out
}

function buildIndex(files) {
  const index = new Map()
  for (const fp of files) {
    const raw = fs.readFileSync(fp, "utf8")
    const name = path.basename(fp, path.extname(fp))
    index.set(name, {
      name,
      filePath: fp,
      relative: path.relative(rootBase, fp).split(path.sep).join("/"),
      fm: readFrontmatter(raw),
      outlinks: extractOutlinks(raw),
    })
  }
  return index
}

function toStr(v) {
  if (v === null || v === undefined) return ""
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v)
}

function mkRow(cells) {
  return "| " + cells.map((c) => toStr(c).replace(/\|/g, "\\|")).join(" | ") + " |"
}

function linkCell(name) {
  return `[[${name}]]`
}

// 依据 dataview FROM 源挑选文件集合
function sourceFiles(source, index) {
  let src = source.replace(/^"|"$/g, "").trim()
  if (src === "") return [...index.values()]
  if (src.startsWith("#")) {
    const tag = src.slice(1)
    return [...index.values()].filter((f) => {
      const t = f.fm.tags
      const tags = Array.isArray(t) ? t : t ? [t] : []
      return tags.map((x) => toStr(x)).includes(tag)
    })
  }
  const prefix = src.replace(/\/$/g, "")
  return [...index.values()].filter(
    (f) => f.relative === prefix || f.relative.startsWith(prefix + "/"),
  )
}

function fieldVal(f, fieldName) {
  const direct = ["状态", "日期", "概念", "创建日期", "课程", "主题", "type"].includes(fieldName)
  if (direct) return f.fm[fieldName] ?? ""
  if (fieldName.toLowerCase() === "file.link") return linkCell(f.name)
  if (fieldName === "file.name") return f.name
  if (fieldName === "file.path") return f.filePath
  return f.fm[fieldName] ?? ""
}

function evalField(file, fieldExpr) {
  let expr = fieldExpr.trim()
  const asMatch = /\sAS\s+(.+)$/i.exec(expr)
  if (asMatch) expr = expr.slice(0, asMatch.index).trim()
  return fieldVal(file, expr)
}

function evalBlock(code, index, selfName) {
  const lines = code
    .split("\n")
    .map((l) => l.replace(/^\s*>\s?/, "").trim())
    .filter((l) => l)
  const rawJoin = lines.join("\n")

  let rest = rawJoin.replace(/^TABLE\s+WITHOUT\s+ID\b/i, "").replace(/^TABLE\b/i, "").trim()

  const sortMatch = /\s+SORT\s+([^\n]+)$/i.exec(rest)
  let sortField = null
  let sortAsc = true
  if (sortMatch) {
    const s = sortMatch[1].trim()
    const asc = s.endsWith("ASC")
    sortField = s.replace(/\s+(ASC|DESC)$/i, "").trim().split(/\s+/)[0]
    sortAsc = asc !== false
    rest = rest.slice(0, sortMatch.index)
  }

  const fromIdx = rest.search(/\bFROM\b/i)
  const whereMatch = /\bWHERE\b([\s\S]*)$/i.exec(rest)
  if (fromIdx < 0 || !whereMatch) return null
  const fieldText = rest.slice(0, fromIdx).trim()
  const source = rest.slice(fromIdx + 4, whereMatch.index).trim()
  const cond = whereMatch[1].trim()
  const fields = fieldText
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean)

  let condType = null
  let conceptVal = null
  let linkVal = null
  let tagExclude = null

  const mConcept = /concept\s*=\s*"([^"]+)"/.exec(cond)
  const mOutlinksNamed = /contains\(file\.outlinks,\s*\[\[([^\]]+)\]\]\)/.exec(cond)
  const mOutlinksThis = /contains\(file\.outlinks,\s*this\.file\.link\)/.exec(cond)
  const mNameNe = /file\.name\s*!=\s*"([^"]+)"/.exec(cond)

  if (mConcept) [condType, conceptVal] = ["concept", mConcept[1]]
  else if (mOutlinksNamed) [condType, linkVal] = ["outlinksNamed", mOutlinksNamed[1].trim()]
  else if (mOutlinksThis) condType = "outlinksThis"
  else if (mNameNe) [condType, tagExclude] = ["nameNe", mNameNe[1]]
  else return null

  let rows = sourceFiles(source, index).filter((f) => {
    switch (condType) {
      case "concept":
        return toStr(f.fm.concept) === conceptVal
      case "outlinksNamed":
        return f.outlinks.has(linkVal)
      case "outlinksThis":
        return f.outlinks.has(selfName)
      case "nameNe":
        return f.name !== tagExclude
      default:
        return false
    }
  })

  if (sortField) {
    rows.sort((a, b) => {
      const av = toStr(fieldVal(a, sortField))
      const bv = toStr(fieldVal(b, sortField))
      return sortAsc ? av.localeCompare(bv, "zh") : bv.localeCompare(av, "zh")
    })
  }

  const colTitles = fields.map((f) => {
    const asMatch = /\sAS\s+(.+)$/i.exec(f)
    return asMatch ? asMatch[1].trim() : f.trim()
  })

  const outLines = [mkRow(colTitles), mkRow(colTitles.map(() => "---"))]
  if (rows.length === 0) {
    outLines.push(mkRow(colTitles.map(() => "")))
    return outLines.join("\n")
  }
  for (const f of rows) {
    outLines.push(mkRow(fields.map((fe) => evalField(f, fe))))
  }
  return outLines.join("\n")
}

function processFile(fp, index) {
  const raw = fs.readFileSync(fp, "utf8")
  const selfName = path.basename(fp, path.extname(fp))
  const out = raw.replace(/```dataview\r?\n([\s\S]*?)```/g, (whole, code) => {
    const stripped = code
      .split("\n")
      .map((l) => l.replace(/^\s*>\s?/, ""))
      .join("\n")
    if (/</.test(stripped)) return whole // 含占位符，视为文档示例
    try {
      const tbl = evalBlock(stripped, index, selfName)
      if (!tbl) return whole
      return tbl
    } catch {
      return whole
    }
  })
  if (out !== raw) fs.writeFileSync(fp, out, "utf8")
}

const files = (await globList("**/*.md", { cwd: contentRoot })).map((f) => path.join(contentRoot, f))
const index = buildIndex(files)
let changed = 0
for (const fp of files) {
  const before = fs.readFileSync(fp, "utf8")
  processFile(fp, index)
  const after = fs.readFileSync(fp, "utf8")
  if (before !== after) changed++
}
console.log(`[dataview] 处理 ${files.length} 篇，改写 ${changed} 篇。`)
