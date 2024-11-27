//import { parseBibFile, normalizeFieldValue } from 'bibtex'

export class Entry {
  entry = null;
  options = null;

  constructor(bibtexEntry, options) {
    this.entry = bibtexEntry;
    this.options = options;
  }

  get year() {
    const year = this.tryGetField("year");
    if (year !== undefined) {
      return year;
    }

    const date = this.tryGetField("date"); //biblatex uses this, just try it
    if (date !== undefined) {
      return date;
    }

    throw (
      "BibTeX doesn't have year for cite key " +
      this.entry._id +
      " use year = {n.d.} if your publication has no year"
    );
  }

  get authorsInText() {
    const ET_AL = "et al.";

    let maxAuthors = 0;
    switch (this.options.style) {
      case "apa":
        maxAuthors = 2;
        break;
      case "harvard":
        maxAuthors = 3;
        break;
      default:
        throw "Unknown citation style: " + this.options.style;
    }

    let authorJoiner = "";
    let authorJoinerBeforeLast = "";
    switch (this.options.style) {
      case "apa":
        authorJoiner = " & ";
        authorJoinerBeforeLast = " & ";
        break;
      case "harvard":
        authorJoiner = ", ";
        authorJoinerBeforeLast = " and ";
        break;
      default:
        throw "Unknown citation style: " + this.options.style;
    }

    let authorsField = this.entry.getField("author");

    if (authorsField === undefined || authorsField.length == 0) {
      //fallback to title if no authors are given
      return this.italicize(normalizeFieldValue(this.entry.getField("title")));
    }

    let inTextAuthors = "";

    const consideredAuthors = authorsField.authors$.slice(0, maxAuthors);

    if (authorsField.authors$.length > maxAuthors) {
      inTextAuthors =
        authorsField.authors$[0].lastNames + " " + this.italicize(ET_AL);
    } else {
      for (let i = 0; i < consideredAuthors.length; i++) {
        inTextAuthors += authorsField.authors$[i].lastNames;
        if (i == consideredAuthors.length - 2) {
          inTextAuthors += authorJoinerBeforeLast;
        } else if (i < consideredAuthors.length - 2) {
          inTextAuthors += authorJoiner;
        }
      }
    }

    return inTextAuthors;
  }

  get authorsStructured() {
    let authors = this.entry.getField("author").authors$.map((author, i) => {
      return {
        firstNames: author.firstNames,
        vons: author.vons,
        lastNames: author.lastNames,
        jrs: author.jrs,
      };
    });

    return authors;
  }

  get authorsInReference() {
    let authorJoiner = "";
    let authorJoinerBeforeLast = "";
    switch (this.options.style) {
      case "apa":
        authorJoiner = ", ";
        authorJoinerBeforeLast = " & ";
        break;
      case "harvard":
        authorJoiner = ", ";
        authorJoinerBeforeLast = " and ";
        break;
      default:
        throw "Unknown citation style: " + this.options.style;
    }

    let firstNameSpacer = "";
    switch (this.options.style) {
      case "apa":
        firstNameSpacer = " ";
        break;
      case "harvard":
        firstNameSpacer = "";
        break;
      default:
        throw "Unknown citation style: " + this.options.style;
    }

    let authors = this.authorsStructured.map((author) => {
      let vons = author.vons.join();
      let last = author.lastNames.join();
      let jrs = author.jrs.join();
      let first = author.firstNames
        .map((fname) => fname ? fname[0] + "." : null)
        .join(firstNameSpacer);

      return (
        (vons && vons.length > 0 ? vons + " " : "") +
        (last ? last : "") +
        (jrs && jrs.length > 0 ? " " + jrs : "") +
        " " +
        first
      );
    });

    let inTextAuthors = "";

    for (let i = 0; i < authors.length; i++) {
      inTextAuthors += authors[i];
      if (i == authors.length - 2) {
        inTextAuthors += authorJoinerBeforeLast;
      } else if (i < authors.length - 2) {
        inTextAuthors += authorJoiner;
      }
    }

    return inTextAuthors;
  }

  italicize(text) {
    switch (this.options.format) {
      case "text":
        return text;
      case "markdown":
        return "*" + text + "*";
      case "html":
        return "<i>" + text + "</i>";
      default:
        throw "Unknown format: " + this.options.format;
    }
  }

  inTextCitation(style, options = {}) {
    const { prefix = "", suffix = "", yearOnly = false } = options;
    const prefixedAuthors =
      (prefix.length > 0 ? prefix + " " : "") +
      (yearOnly ? "" : this.authorsInText);
    const yearSuffixed =
      this.year +
      (suffix.length > 0 ? (suffix.startsWith(", ") ? "" : ", ") + suffix : "");

    switch (style) {
      case "n":
      case "narrative":
        return (
          prefixedAuthors +
          " (" +
          (yearSuffixed !== undefined ? yearSuffixed + ")" : "")
        );
      case "p":
      case "parenthetical":
        return (
          prefixedAuthors +
          (yearSuffixed !== undefined
            ? (yearOnly ? "" : ", ") + yearSuffixed
            : "")
        );

      default:
        console.error("Unknown citation style: " + style);
        break;
    }
  }

  getField(fieldName) {
    return this.entry.getField(fieldName);
  }

  tryGetField(fieldName) {
    const field = this.getField(fieldName);
    if (field !== undefined) {
      return normalizeFieldValue(field);
    } else {
      return undefined;
    }
  }
}

export class TinyBibRender {
  bt = null;
  options = null;

  constructor(bibtex, options) {
    try {
      this.bt = parseBibFile(bibtex);
      this.options = options;
    } catch (ex) {
      throw "Error parsing bibtex: " + ex;
    }
  }

  get citeKeys() {
    return Object.keys(this.bt.entries$);
  }

  getEntry(citeKey) {
    citeKey = citeKey.toLowerCase();

    if (!this.citeKeys.includes(citeKey)) {
      throw (
        "The following key could not be found in bibliography: '" +
        citeKey +
        "'"
      );
    }

    return new Entry(this.bt.getEntry(citeKey), this.options);
  }

  codeToCitation(code, replacementCallback) {
    const style =
      code.startsWith("[") && code.endsWith("]")
        ? "parenthetical"
        : "narrative";

    const codeWithoutBraces = (
      style == "parenthetical" ? code.substr(1, code.length - 2) : code
    ).toLowerCase();

    const codeSegments = codeWithoutBraces.split(";");

    const arrayOfCitations = codeSegments.map((segment) => {
      const parsed = this.parseCodeSegment(segment.trim());

      if (parsed.citekey == "") {
        console.log("Empty key, likely a typo, skipping:", parsed);
        throw "Empty key, likely a typo, skipping";
      }

      const entry = this.getEntry(parsed.citekey);

      let citation = entry.inTextCitation(style, parsed);

      if (replacementCallback !== undefined) {
        const replacement = replacementCallback(parsed.citekey);
        citation = replacement.prefix + citation + replacement.suffix;
      }

      return citation;
    });

    const joinedCitations = arrayOfCitations.join("; ");

    return style == "parenthetical"
      ? "(" + joinedCitations + ")"
      : joinedCitations;
  }

  parseCodeSegment(codeSegment) {
    const CITEKEY_TERMINATING_CHARACTERS = " [], {}~# %\\";

    // this is called only by codeToCitation which prepares citation codeSegment in a way that it only contains one citekey
    let parsed = {
      prefix: "",
      citekey: "",
      suffix: "",
    };
    let yearOnly = false;

    let state = "prefix";

    for (let i = 0; i < codeSegment.length; i++) {
      const c = codeSegment[i];
      const next = codeSegment[i + 1];

      if (state == "prefix" && c == "-" && next == "@") {
        i++; //skip this and the next character
        state = "citekey";
        yearOnly = true;
        continue;
      } else if (state == "prefix" && c == "@") {
        state = "citekey";
        continue;
      } else if (
        state == "citekey" &&
        CITEKEY_TERMINATING_CHARACTERS.includes(c)
      ) {
        state = "suffix";
      }

      parsed[state] += c;
    }

    Object.keys(parsed).forEach((key) => (parsed[key] = parsed[key].trim()));

    if (parsed.suffix.startsWith("[") && parsed.suffix.endsWith("]")) {
      parsed.suffix = parsed.suffix.substring(1, parsed.suffix.length - 1);
    }

    parsed.yearOnly = yearOnly;

    return parsed;
  }

  transformInTextCitations(text, replacementCallback = undefined) {
    if (!text.includes("@")) {
      //there is nothing to be done
      return text;
    }

    /*
    Original regex: /(\[[^\]]*\-?@[^ \[\],{}~#%\\]+[^\]]*\])|(@[^ \[\],{}~#%\\]+[ ]?\[[^\]]+\])|(@[^ \[\],{}~#%\\]+)/gm
    It has three parts:
      (\[[^\]]*\-?@[^ \[\],{}~#%\\]+[^\]]*\]) ... matches citekeys enclosed in square braces; [e.g. @cockett2015, pg. 22; cf. @cockett2016, chap. 6]
      (@[^ \[\],{}~#%\\]+[ ]?\[[^\]]+\]) ... matches citekeys without braces but followed immediately or with a space by a square-braces-enclosed suffix; @cockett2015 [pg. 26]
      (@[^ \[\],{}~#%\\]+) ... matches simply citekeys without any square braces; @cockett2015
    */
    const regex = new RegExp(
      "(\\[[^\\]]*\\-?@[^ \\[\\],{}~#%\\\\]+[^\\]]*\\])|(@[^ \\[\\],{}~#%\\\\]+[ ]?\\[[^\\]]+\\])|(@[^ \\[\\],{}~#%\\\\]+)",
      "gm"
    );

    const processedText = text.replace(regex, (match) => {
      return this.codeToCitation(match, replacementCallback);
    });

    return processedText;
  }

  getDetails(citeKey) {
    const entry = this.getEntry(citeKey);

    return {
      type: entry.entry.type,
      authorsStructured: entry.authorsStructured,
      details: {
        address: entry.tryGetField("address"),
        author: entry.authorsInReference,
        booktitle: entry.tryGetField("booktitle"),
        chapter: entry.tryGetField("chapter"),
        doi: entry.tryGetField("doi"),
        edition: entry.tryGetField("edition"),
        howpublished: entry.tryGetField("howpublished"),
        institution: entry.tryGetField("institution"),
        journal: entry.tryGetField("journal"),
        month: entry.tryGetField("month"),
        note: entry.tryGetField("note"),
        number: entry.tryGetField("number"),
        organization: entry.tryGetField("organization"),
        pages: entry.tryGetField("pages"),
        publisher: entry.tryGetField("publisher"),
        school: entry.tryGetField("school"),
        type: entry.tryGetField("type"),
        series: entry.tryGetField("series"),
        title: entry.tryGetField("title"),
        url: entry.tryGetField("url"),
        year: entry.tryGetField("year"),
      },
    };
  }
}
