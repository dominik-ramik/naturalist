export let AboutView = {
    view: function(vnode) {

        let text = vnode.attrs.text;
        text = text.replaceAll("\\n", "\n");
        let htmlText = marked.parse(text);
        htmlText = DOMPurify.sanitize(htmlText);

        return m(".about-view", m.trust(htmlText));
    },
}