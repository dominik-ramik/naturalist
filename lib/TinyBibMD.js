//import { BibtexParser } from "bibtex-js-parser";

export class TinyBibReader {
  constructor(bibtex) {
    //remove comments as BibtexParser seems to have troubles with them
    bibtex = bibtex.replace(/[\s]*%.*/gm, "");

    const months = {
      jan: "January",
      feb: "",
      mar: "",
      apr: "",
      may: "",
      jun: "",
      jul: "",
      aug: "",
      sep: "",
      oct: "",
      nov: "",
      dec: "",
    };

    //hotfix for month = jan without quotes, this is supposed to be a macro but not supported by BibtexParser
    bibtex = bibtex.replace(
      new RegExp(
        "month[^\\S\r\n]*=[^\\S\r\n]*(" + Object.keys(months).join("|") + ")",
        "gm"
      ),
      (match, g1) => {
        return 'month="' + months[g1] + '"';
      }
    );

    //hotfix for year = 1234 without quotes
    bibtex = bibtex.replace(/year[^\S\r\n]*=[^\S\r\n]*([0-9]+)/gm, 'year="$1"');

    //flatten the references
    bibtex = bibtex.replace(/[\r\n][\s]*([^@])/gm, " $1");

    //add comma to the last entry in each bibtex citation, for some reason this is required by BibtexParser and it raises an error if the comma is missing
    bibtex = bibtex.replace(/(["\\}]{1})([\s]*[\n]?)(}[\s]*)/gm, "$1,\n$2$3");

    //change single-line bibtex to multiline as expected by BibtexParser
    bibtex = bibtex.replace(/,([\s]*[a-zA-Z]+[\s]*=)/gm, ",\n$1");

    //ensure entries are on new lines
    bibtex = bibtex.replace(/(@[\s]*[a-zA-Z]+\{[\s]*)/gm, "\n$1");

    //add new line before final } if it ends with , }, BibtexParser doesn't like this either
    bibtex = bibtex.replace(/,([^\S\r\n]*}[^\S\r\n]*)/gm, ",\n$1");

    //matches fields where inside {} or "" there is another { or } ... e.g. title={ Man{\"o}w } or title="Man{\"o}w"
    bibtex = bibtex.replace(
      /[^\S\r\n]*[a-zA-Z]+[^\S\r\n]*=[^\S\r\n]*"(.*[|\\{|\\}]+.*)"[^\S\r\n]*,|[^\S\r\n]*[a-z]+[^\S\r\n]*=[^\S\r\n]*\{(.*[\\{\\}]+.*)\}[^\S\r\n]*,/gm,
      (match, g1, g2) => {
        const group = g1 ? g1 : g2;
        return match.replace(group, group.replace(/\{\}/g), "");
      }
    );

    //get citeKeys
    const rawCiteKeys = bibtex.match(
      /[^\s]*@[a-zA-Z]+[\s]*\{[^\r\n]+,[\r\n]+/gm
    );

    if (!rawCiteKeys) {
      throw "No citekeys found in bibtex";
    }

    const issues = [];
    const allowedSingleCharacters = "-";
    const allowedEntryTypes = [
      "article",
      "book",
      "booklet",
      "conference",
      "inbook",
      "incollection",
      "inproceedings",
      "manual",
      "mastersthesis",
      "misc",
      "phdthesis",
      "proceedings",
      "techreport",
      "unpublished",
    ];
    //check citeKeys integrity
    rawCiteKeys.forEach((key) => {
      const trimmed = key.trim();
      const type = trimmed.substring(1, trimmed.indexOf("{")).toLowerCase();
      const citekey = trimmed.substring(trimmed.indexOf("{") + 1);

      if (!allowedEntryTypes.includes(type)) {
        issues.push("Unknown BibTeX entry type: " + type);
      }

      if (!trimmed.endsWith(",")) {
        issues.push("Missing comma at the end of citekey: " + trimmed);
      }

      if (!trimmed.endsWith(",")) {
        issues.push("Missing comma at the end of citekey: " + trimmed);
      }
      if (!trimmed.endsWith(",")) {
        issues.push("Missing comma at the end of citekey: " + trimmed);
      }

      //only iterate to the penultime character as the last one will be a comma anyways
      const unexpectedCharacters = [];
      for (let i = 0; i < citekey.length - 1; i++) {
        const c = citekey[i];

        //BibtexParser only allows letters, numbers, -
        if (
          !(
            allowedSingleCharacters.includes(c) ||
            (c >= "a" && c <= "z") ||
            (c >= "A" && c <= "Z") ||
            (c >= "0" && c <= "9")
          )
        ) {
          if (!unexpectedCharacters.includes(c)) unexpectedCharacters.push(c);
        }
      }
      if (unexpectedCharacters.length > 0) {
        issues.push(
          "Unexpected characters in citekey '" +
            citekey.substr(0, citekey.length - 1) +
            "' (" +
            unexpectedCharacters.join("") +
            ")"
        );
      }
    });

    if (issues.length > 0) {
      throw "Issues with citekeys: " + issues.join("; ");
    }

    //split to individual references
    const splitBibtex = bibtex.split(/([\s\r\n]*@[a-zA-Z]+[^@]+})[\s\r\n]*/gm);

    const json = splitBibtex
      .filter((singleBib) => singleBib.length > 0)
      .map((singleBib) => {
        let json = {};
        try {
          const parsed = BibtexParser.parseToJSON(singleBib);
          if (parsed) {
            json = parsed[0];
          }
        } catch (e) {
          console.log("ERROR", e);
          console.trace();
          console.log(singleBib);
          throw "Error parsing bibtex. " + e + "\n" + singleBib;
        }
        return json;
      });

    console.log("Error", json, bibtex);

    for (const entry of json) {
      const processedEntry = {};

      Object.keys(entry).forEach((key) => {
        processedEntry[key.toLowerCase()] = entry[key];
      });

      if (processedEntry.author) {
        processedEntry.authorStructured = this.extractNames(
          processedEntry.author
        );
      }
      if (processedEntry.editor) {
        processedEntry.editorStructured = this.extractNames(
          processedEntry.editor
        );
      }

      const lowerCiteKey = entry.id.toLowerCase();

      if (lowerCiteKey in this.bibliography) {
        throw (
          "Duplicate citeKey " +
          lowerCiteKey +
          " - all citeKeys in your BibTeX must be unique (regardless to letter case)"
        );
      }

      this.bibliography[lowerCiteKey] = processedEntry;
    }
  }

  _bibliography = {};

  get bibliography() {
    return this._bibliography;
  }

  get citeKeys() {
    return Object.keys(this.bibliography);
  }

  extractNames(namesString) {
    const WHITESPACES = /\s+/g;

    const namesStructure = namesString
      .replace(/[\t\n\r]/gm, " ")
      .split(" and ")
      .map((name) => {
        const nameParts = name
          .trim()
          .split(",")
          .map((part) => part.trim());

        let nameStructure = {
          first: [],
          vons: [],
          jrs: [],
          last: [],
        };

        switch (nameParts.length) {
          case 1:
            //no commas: First von Last
            nameStructure = firstVonLast(nameParts[0]);
            break;
          case 2:
            //one comma: von Last, First
            nameStructure = vonLastFirst(nameParts[0], nameParts[1]);
            break;
          case 3:
            //two commas: von Last, Jr, First
            nameStructure = vonLastJrFirst(
              nameParts[0],
              nameParts[1],
              nameParts[2]
            );
            break;
          default:
            break;
        }

        return nameStructure;
      });

    return namesStructure;

    function firstVonLast(outer) {
      const authorTokens = splitOnWhitespace(outer, WHITESPACES);

      let vonStartInclusive = -1;
      let vonEndExclusive = -1;
      let firstNameEndExclusive = -1;

      for (let i = 0; i < authorTokens.length - 1; i++) {
        if (startsWithLowerCaseBSD(authorTokens[i])) {
          if (vonStartInclusive < 0)
            // Start von if not already started
            vonStartInclusive = i;
          // End von at last word that starts with lowercase
          vonEndExclusive = i + 1;
        }
      }
      if (vonStartInclusive >= 0) firstNameEndExclusive = vonStartInclusive;
      else firstNameEndExclusive = authorTokens.length - 1;

      const von =
        vonStartInclusive >= 0
          ? getSubStringAsArray(
              authorTokens,
              vonStartInclusive,
              vonEndExclusive
            )
          : [];
      const firstName = getSubStringAsArray(
        authorTokens,
        0,
        firstNameEndExclusive
      );
      const lastName = getSubStringAsArray(
        authorTokens,
        Math.max(vonEndExclusive, firstNameEndExclusive),
        authorTokens.length
      );

      return {
        first: firstName,
        vons: von,
        last: lastName,
        jrs: [],
      };
    }

    function vonLastFirst(vonLastStr, firstStr) {
      const vonLast = splitOnWhitespace(vonLastStr, WHITESPACES);
      const first = splitOnWhitespace(firstStr, WHITESPACES);

      let vonStartInclusive = -1;
      let vonEndExclusive = -1;

      for (let i = 0; i < vonLast.length - 1; i++)
        if (startsWithLowerCaseBSD(vonLast[i])) {
          if (vonStartInclusive < 0) vonStartInclusive = i;
          vonEndExclusive = i + 1;
        }

      const von =
        vonStartInclusive >= 0
          ? getSubStringAsArray(vonLast, 0, vonEndExclusive)
          : [];
      const firstName = first;
      const lastName = getSubStringAsArray(
        vonLast,
        Math.max(vonEndExclusive, 0)
      );

      return {
        first: firstName,
        vons: von,
        last: lastName,
        jrs: [],
      };
    }

    function vonLastJrFirst(vonLastStr, jrStr, firstStr) {
      const vonLast = splitOnWhitespace(vonLastStr, WHITESPACES);
      const firstName = splitOnWhitespace(firstStr, WHITESPACES);
      const jr = splitOnWhitespace(jrStr, WHITESPACES);

      let vonStartInclusive = -1;
      let vonEndExclusive = -1;

      for (let i = 0; i < vonLast.length - 1; i++)
        if (startsWithLowerCaseBSD(vonLast[i])) {
          if (vonStartInclusive < 0) vonStartInclusive = i;
          vonEndExclusive = i + 1;
        }

      const von =
        vonStartInclusive >= 0
          ? getSubStringAsArray(vonLast, 0, vonEndExclusive)
          : [];
      const lastName = getSubStringAsArray(
        vonLast,
        Math.max(vonEndExclusive, 0)
      );

      return {
        first: firstName,
        vons: von,
        last: lastName,
        jrs: jr,
      };
    }

    function getSubStringAsArray(tokens, startIncl, endExcl) {
      const arr = [];
      for (
        let i = startIncl;
        i < (endExcl === undefined ? tokens.length : endExcl);
        i++
      ) {
        arr.push(tokens[i]);
      }
      return arr;
    }

    function splitOnWhitespace(data) {
      return data.split(/\s/);
    }

    function startsWithLowerCaseBSD(authorToken) {
      if (authorToken.length > 0) return startsWithLowerCase(authorToken[0]);
      else return false;
    }

    function startsWithLowerCase(authorToken) {
      if (isString(authorToken)) {
        if (!authorToken) return false;
        const ch = authorToken.charAt(0);
        return ch.toLowerCase() === ch && ch.toUpperCase() !== ch;
      }

      return false;
    }

    function isString(data) {
      return typeof data === "string";
    }
  }
}

export class TinyBibFormatter {
  json = {};
  options = {
    style: "apa",
    format: "text",
  };

  constructor(bibliographyJSON, options) {
    if (
      typeof bibliographyJSON === "object" &&
      !Array.isArray(bibliographyJSON)
    ) {
      this.json = bibliographyJSON;
      this.options = options;
    } else {
      throw "Unexpected bibliograpy format";
    }
  }

  getEntry(citeKey) {
    const lowerCiteKey = citeKey.toLowerCase();
    if (lowerCiteKey in this.json) {
      return this.json[lowerCiteKey];
    } else {
      throw "Unknown citeKey: " + lowerCiteKey;
    }
  }

  italicize(text) {
    text = text?.trim();
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

  codeToCitation(code, replacementCallback) {
    const style =
      code.startsWith("[") && code.endsWith("]")
        ? "parenthetical"
        : "narrative";

    const codeWithoutBraces =
      style == "parenthetical" ? code.substr(1, code.length - 2) : code;

    const codeSegments = codeWithoutBraces.split(";");

    const arrayOfCitations = codeSegments.map((segment) => {
      const parsed = this.parseCodeSegment(segment.trim());

      if (parsed.citekey == "") {
        throw "Empty key, likely a typo, skipping";
      }

      let citation = this.inTextCitation(parsed.citekey, style, parsed);

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

  inTextCitation(citeKey, style, additionalData = {}) {
    const { prefix = "", suffix = "", yearOnly = false } = additionalData;
    const prefixedAuthors =
      (prefix.length > 0 ? prefix + " " : "") +
      (yearOnly ? "" : this.authorsInText(citeKey));
    const yearSuffixed =
      this.getEntry(citeKey).year +
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
        throw "Unknown citation style: " + style;
    }
  }

  authorsInText(citeKey) {
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

    let authorStructured = this.getEntry(citeKey).authorStructured;

    if (authorStructured === undefined || authorStructured.length == 0) {
      //fallback to title if no authors are given
      return this.italicize(this.json[citeKey].title);
    }

    let inTextAuthors = "";

    const consideredAuthors = authorStructured.slice(0, maxAuthors);

    if (authorStructured.length > maxAuthors) {
      inTextAuthors = authorStructured[0].last + " " + this.italicize(ET_AL);
    } else {
      for (let i = 0; i < consideredAuthors.length; i++) {
        inTextAuthors += authorStructured[i].last;
        if (i == consideredAuthors.length - 2) {
          inTextAuthors += authorJoinerBeforeLast;
        } else if (i < consideredAuthors.length - 2) {
          inTextAuthors += authorJoiner;
        }
      }
    }

    return inTextAuthors;
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

  getAuthorsInReference(citeKey, forceKindOfAuthor) {
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

    const entry = this.getEntry(citeKey);

    let kindOfAuthor = "";
    let authorToRender = null;

    if (!forceKindOfAuthor) {
      forceKindOfAuthor = "author";
    }

    switch (forceKindOfAuthor) {
      case "author":
        kindOfAuthor = "author";
        authorToRender = entry.authorStructured;
        break;
      case "editor":
        kindOfAuthor = "editor";
        authorToRender = entry.editorStructured;
        break;

      default:
        break;
    }

    if (!authorToRender) {
      return undefined;
    }

    let authors = authorToRender.map((author) => {
      let vons = author.vons.join();
      let last = author.last.join();
      let jrs = author.jrs.join();
      let first = author.first
        .map((fname) => (fname ? fname[0] + "." : null))
        .join(firstNameSpacer);

      return (
        (vons && vons.length > 0 ? vons + " " : "") +
        (last ? last + (first.length > 0 || jrs.length > 0 ? "," : "") : "") +
        (jrs && jrs.length > 0 ? " " + jrs : "") +
        " " +
        first
      );
    });

    let inReferenceAuthors = "";

    for (let i = 0; i < authors.length; i++) {
      inReferenceAuthors += authors[i];
      if (i == authors.length - 2) {
        inReferenceAuthors += "," + authorJoinerBeforeLast;
      } else if (i < authors.length - 2) {
        inReferenceAuthors += authorJoiner;
      }
    }

    return inReferenceAuthors + (kindOfAuthor == "editor" ? " (Eds.)" : "");
  }

  getFullReference(citeKey) {
    switch (this.options.style) {
      case "apa":
        return this.getFullReferenceApa(citeKey);
      default:
        throw "Unknown citation style: " + this.options.style;
    }
  }

  getFullReferenceApa(citeKey) {
    const entry = this.getEntry(citeKey);

    const author = this.getAuthorsInReference(citeKey, "author");
    const editor = this.getAuthorsInReference(citeKey, "editor");

    let ref = "";

    ref += this.conditionalRender(author, "", "");
    if (!author) {
      ref += this.conditionalRender(editor, "", ".");
    }

    ref += this.conditionalRender(entry.year, " (", ").");
    if (entry.type == "book" || entry.type == "incollection") {
      ref += this.conditionalRender(entry.series, " ", ".");
    }

    ref += this.conditionalRender(entry.title, " ", "");

    if (entry.type == "book" || entry.type == "incollection") {
      if (entry.author) {
        ref += this.conditionalRender(
          this.getAuthorsInReference(citeKey, "editor"),
          ". ",
          ""
        );
      }
      ref += this.conditionalRender(this.italicize(entry.booktitle), ", ", "");
    }

    ref += this.conditionalRender(this.italicize(entry.journal), ". ", "");
    ref += this.conditionalRender(entry.volume, ", ", "");
    ref += this.conditionalRender(entry.number, "(", ")");
    ref += this.conditionalRender(entry.pages?.replace("--", "–"), ", ", "");

    if (entry.type == "book" || entry.type == "incollection") {
      ref += this.conditionalRender(entry.publisher, ". ", "");
    }

    if (entry.doi) {
      ref += this.conditionalRender(entry.doi, ". ", "");
    } else {
      ref += ".";
    }

    return ref;
  }

  conditionalRender(text, prefix, suffix) {
    if (text === undefined || text === null) {
      return "";
    }

    const sanitisedText = text.toString();

    if (sanitisedText.length == 0) {
      return "";
    }

    return prefix + sanitisedText + suffix;
  }
}
