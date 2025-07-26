  getAvailableMaps: function () {
    let availableMaps = [];

    // Get all data meta entries with "map regions" formatting
    const dataMeta = Checklist.getDataMeta();
    
    Object.keys(dataMeta).forEach(function(dataPath) {
      const meta = dataMeta[dataPath];
      
      if (meta.formatting === "map regions" && meta.template && meta.template.trim() !== "") {
        // Process the template to get the actual map source
        let source = meta.template;
        
        // Check if there's a compiled Handlebars template
        if (Checklist.handlebarsTemplates[dataPath]) {
          // Use empty template data since we just want the base source
          let templateData = Checklist.getDataObjectForHandlebars("", {}, "", "");
          source = Checklist.handlebarsTemplates[dataPath](templateData);
        }
        
        if (source && source.trim() !== "") {
          // Remove leading slash if present
          if (source.startsWith("/")) {
            source = source.substring(1);
          }
          
          // Convert to usercontent relative path
          const mapPath = relativeToUsercontent(source);
          
          availableMaps.push({
            title: meta.title || dataPath,
            dataPath: dataPath,
            source: mapPath,
            isWorldMap: source.toLowerCase().endsWith("world.svg")
          });
        }
      }
    });

    return availableMaps;
  },
