--[[
  filter-mdcomments.lua — Full mdcomments Lua filter for Pandoc.

  Transforms c- prefixed footnotes into a comment sidebar UI:
    - Parses ==text== highlight syntax (not natively supported by Pandoc)
    - Detects c- prefixed footnotes and extracts metadata + comment entries
    - Replaces inline footnote refs with comment badges
    - Replaces footnote bodies with sidebar thread cards
    - Injects sidebar HTML and plugin CSS

  Usage:
    pandoc input.md --lua-filter=filter-mdcomments.lua -s -o output.html
]]

-- Storage for parsed comment threads
local threads = {}
local thread_order = {}

-- Pre-extract footnote labels from source (in reference order).
-- Pandoc's Note element does not carry the original label, so we map
-- Note callbacks to source labels by encounter order.
local labels_in_ref_order = {}
do
  local source_paths = {}

  if PANDOC_STATE and PANDOC_STATE.input_files then
    for _, path in ipairs(PANDOC_STATE.input_files) do
      table.insert(source_paths, path)
    end
  end

  -- Fallback for example-local execution.
  if #source_paths == 0 then
    table.insert(source_paths, pandoc.path.join(
      {pandoc.path.directory(PANDOC_SCRIPT_FILE), "..", "input.md"}))
  end

  local src = nil
  for _, input_path in ipairs(source_paths) do
    local f = io.open(input_path, "r")
    if f then
      src = f:read("*a")
      f:close()
      break
    end
  end

  if src then
    -- Collect labels from inline references only (skip definition headers).
    for line in src:gmatch("[^\n]*\n?") do
      local trimmed = line:match("^%s*(.-)%s*$")
      if not trimmed:match("^%[%^[^%]]+%]:") then
        for label in line:gmatch("%[%^([^%]]+)%]") do
          table.insert(labels_in_ref_order, label)
        end
      end
    end
  end
end
local note_counter = 0

-- ─── Helpers ────────────────────────────────────────────────────────

local function escape_html(s)
  return s:gsub("&", "&amp;"):gsub("<", "&lt;"):gsub(">", "&gt;"):gsub('"', "&quot;")
end

local function starts_with(s, prefix)
  return s:sub(1, #prefix) == prefix
end

local function stringify(inlines)
  local buf = {}
  pandoc.walk_inline(pandoc.Span(inlines), {
    Str = function(el) table.insert(buf, el.text) end,
    Space = function() table.insert(buf, " ") end,
    SoftBreak = function() table.insert(buf, "\n") end,
    LineBreak = function() table.insert(buf, "\n") end,
    Code = function(el) table.insert(buf, el.text) end,
    Cite = function(el)
      -- Pandoc may parse @author as a citation: reconstruct the text
      for _, citation in ipairs(el.citations) do
        table.insert(buf, "@" .. citation.id)
      end
    end,
  })
  return table.concat(buf)
end

-- Parse text content of a footnote to extract metadata and comment entries
local function parse_thread_content(blocks)
  local meta = {}
  local entries = {}
  local current_entry = nil

  for _, block in ipairs(blocks) do
    if block.t == "Para" or block.t == "Plain" then
      local text = stringify(block.content)

      -- Process line by line (SoftBreak/LineBreak produce \n in stringify)
      for line in text:gmatch("[^\n]+") do
        local trimmed = line:match("^%s*(.-)%s*$")

        -- Metadata (before any @-entry)
        local key, val = trimmed:match("^(status):%s*(.+)$")
        if not key then
          key, val = trimmed:match("^(anchor):%s*(.+)$")
        end
        if key and #entries == 0 then
          val = val:match('^"(.*)"$') or val:match("^'(.*)'$") or val
          meta[key:lower()] = val
          goto continue_line
        end

        -- Author line: @name (YYYY-MM-DD):
        local author, date = trimmed:match("^@(%w+)%s*%((%d%d%d%d%-%d%d%-%d%d)%):?$")
        if author then
          current_entry = { author = author, date = date, body_lines = {} }
          table.insert(entries, current_entry)
          goto continue_line
        end

        -- Body text for current entry — strip blockquote prefix
        if current_entry then
          local body_line = trimmed:match("^>%s*(.*)$") or trimmed
          if body_line and #body_line > 0 then
            table.insert(current_entry.body_lines, body_line)
          end
        end

        ::continue_line::
      end

    elseif block.t == "BlockQuote" then
      -- Blockquote body for current entry (may occur in some Pandoc versions)
      if current_entry then
        for _, bq_block in ipairs(block.content) do
          if bq_block.t == "Para" or bq_block.t == "Plain" then
            local text = stringify(bq_block.content)
            for line in text:gmatch("[^\n]+") do
              table.insert(current_entry.body_lines, line:match("^%s*(.-)%s*$"))
            end
          end
        end
      end
    end
  end

  return { meta = meta, entries = entries }
end

-- Render a thread as sidebar HTML
local function render_thread_html(id, thread)
  local status = thread.meta.status or "open"
  local status_label = status:sub(1,1):upper() .. status:sub(2)
  local status_class = status == "resolved"
    and "mdcomment-status-resolved"
    or  "mdcomment-status-open"

  local parts = {}
  table.insert(parts, string.format(
    '<div class="mdcomment-thread" id="thread-%s" data-status="%s">',
    escape_html(id), escape_html(status)))

  if thread.meta.anchor then
    table.insert(parts, string.format(
      '  <div class="mdcomment-thread-anchor">%s</div>',
      escape_html(thread.meta.anchor)))
  end

  table.insert(parts, string.format(
    '  <span class="mdcomment-status %s">%s</span>',
    status_class, status_label))

  for _, entry in ipairs(thread.entries) do
    local initial = entry.author:sub(1,1):upper()
    local body_html = ""
    for _, line in ipairs(entry.body_lines) do
      body_html = body_html .. "<p>" .. escape_html(line) .. "</p>"
    end

    table.insert(parts, '  <div class="mdcomment-entry">')
    table.insert(parts, '    <div class="mdcomment-author-line">')
    table.insert(parts, string.format(
      '      <span class="mdcomment-avatar">%s</span>', initial))
    table.insert(parts, string.format(
      '      <span class="mdcomment-author">@%s</span>',
      escape_html(entry.author)))
    table.insert(parts, string.format(
      '      <span class="mdcomment-date">%s</span>',
      escape_html(entry.date)))
    table.insert(parts, '    </div>')
    table.insert(parts, string.format(
      '    <div class="mdcomment-body">%s</div>', body_html))
    table.insert(parts, '  </div>')
  end

  table.insert(parts, '</div>')
  return table.concat(parts, "\n")
end

-- ─── Inline filter: ==highlight== syntax ────────────────────────────

-- Pandoc doesn't support ==text== natively. We process raw strings
-- to find == delimiters and wrap them in <mark>.
function Inlines(inlines)
  local new_inlines = pandoc.List()
  local i = 1

  while i <= #inlines do
    local el = inlines[i]

    if el.t == "Str" and el.text:find("==", 1, true) then
      -- Try to find matching == pairs across consecutive inlines
      -- Collect text from current position
      local collected = {}
      local j = i
      local full_text = ""

      while j <= #inlines do
        if inlines[j].t == "Str" then
          full_text = full_text .. inlines[j].text
        elseif inlines[j].t == "Space" then
          full_text = full_text .. " "
        elseif inlines[j].t == "SoftBreak" then
          full_text = full_text .. " "
        else
          break
        end
        table.insert(collected, inlines[j])
        j = j + 1
      end

      -- Check for ==...== pattern
      local pre, highlighted, post = full_text:match("^(.-)=="  .. "(.-)" .. "==(.*)$")
      if highlighted then
        -- Emit pre-text
        if pre and #pre > 0 then
          new_inlines:insert(pandoc.Str(pre))
        end
        -- Emit highlighted text as <mark>
        new_inlines:insert(pandoc.RawInline("html",
          '<mark class="mdcomment-highlight">'))
        new_inlines:insert(pandoc.Str(highlighted))
        new_inlines:insert(pandoc.RawInline("html", '</mark>'))
        -- Emit post-text
        if post and #post > 0 then
          new_inlines:insert(pandoc.Str(post))
        end
        i = j
      else
        new_inlines:insert(el)
        i = i + 1
      end
    else
      new_inlines:insert(el)
      i = i + 1
    end
  end

  return new_inlines
end

-- ─── Note filter: detect c- prefixed footnotes ─────────────────────

function Note(note)
  note_counter = note_counter + 1
  local label = labels_in_ref_order[note_counter]

  -- Keep regular footnotes unchanged.
  if not label or not starts_with(label, "c-") then
    return note
  end

  local thread = parse_thread_content(note.content)
  if #thread.entries == 0 then
    return note
  end

  local thread_id = label
  if not threads[thread_id] then
    table.insert(thread_order, thread_id)
    threads[thread_id] = thread
  end

  -- Replace the footnote with an inline comment badge
  local status = thread.meta.status or "open"
  local badge_html = string.format(
    '<a class="mdcomment-badge" href="#thread-%s" data-status="%s" title="Comment thread: %s">💬</a>',
    escape_html(thread_id), escape_html(status), escape_html(thread_id))

  return pandoc.RawInline("html", badge_html)
end

-- ─── Document filter: inject sidebar ────────────────────────────────

function Pandoc(doc)
  if #thread_order == 0 then
    return doc
  end

  -- Read plugin CSS
  local css_path = pandoc.path.join({pandoc.path.directory(PANDOC_SCRIPT_FILE), "..", "shared", "style-plugin.css"})
  local css_content = ""
  local f = io.open(css_path, "r")
  if f then
    css_content = f:read("*a")
    f:close()
  end

  -- Build sidebar HTML
  local sidebar_parts = {
    '<div class="mdcomments-sidebar">',
    '  <div class="mdcomments-sidebar-header">Comments</div>'
  }
  for _, id in ipairs(thread_order) do
    table.insert(sidebar_parts, render_thread_html(id, threads[id]))
  end
  table.insert(sidebar_parts, '</div>')

  -- Wrap everything in page layout
  local open_html = '<style>' .. css_content .. '</style>\n<div class="mdcomments-page">\n<div class="mdcomments-content">'
  local close_html = '</div>\n' .. table.concat(sidebar_parts, "\n") .. '\n</div>'

  -- Prepend opening wrapper, append closing wrapper + sidebar
  table.insert(doc.blocks, 1, pandoc.RawBlock("html", open_html))
  table.insert(doc.blocks, pandoc.RawBlock("html", close_html))

  return doc
end
