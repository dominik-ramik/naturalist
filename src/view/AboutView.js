import { marked } from "marked";
import DOMPurify from "dompurify";
import m from "mithril";
import { registerMessages, selfKey, t, tf } from 'virtual:i18n-self';
import "./AboutView.css";
import { processMarkdownWithBibliography } from "../components/Utils.js";

export let AboutView = {
    view: function(vnode) {

        let text = vnode.attrs.text;
        text = text.replaceAll("\\n", "\n");
        // Process markdown if needed
        let processedText = processMarkdownWithBibliography(text, "", true);

        return m("div.about-view", { 
            style: { padding: "1em" } 
        }, [
            m.trust(processedText)
        ]);
    },
}