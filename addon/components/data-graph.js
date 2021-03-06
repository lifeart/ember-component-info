import Component from '@ember/component';
import layout from '../templates/components/data-graph';
import { hierarchy, tree}  from 'd3-hierarchy'
import { select } from 'd3-selection';
import { linkHorizontal, linkVertical } from 'd3-shape';
export default Component.extend({
  layout,
  didInsertElement() {
    const width = 2600;
    const chart = () => {

      const root = treePlot(this.data[0]);
    
      let x0 = Infinity;
      let x1 = -x0;
      root.each(d => {
        if (d.x > x1) x1 = d.x;
        if (d.x < x0) x0 = d.x;
      });
	//   console.log('' + (this.data[0].children.length * 200) + 'px');
      const svg = select('#graph').append("svg", width, x1 - x0 + root.dx * 2)
          .style("width", "200vw")
          .style("height", '' + (this.data[0].children.length * 200) + 'px');
      
      const g = svg.append("g")
          .attr("font-family", "sans-serif")
          .attr("font-size", 10)
          .attr("transform", `translate(${root.dy / 3},${root.dx - x0})`);
        
      const link = g.append("g")
        .attr("fill", "none")
        .attr("stroke", "#555")
        .attr("stroke-opacity", 0.4)
        .attr("stroke-width", 1.5)
      .selectAll("path")
        .data(root.links())
        .join("path")
          .attr("d", linkHorizontal()
              .x(d => d.y)
              .y(d => d.x));
      
      const node = g.append("g")
          .attr("stroke-linejoin", "round")
          .attr("stroke-width", 3)
        .selectAll("g")
        .data(root.descendants().reverse())
        .join("g")
          .attr("transform", d => `translate(${d.y},${d.x})`);
    
      node.append("circle")
          .attr("fill", d => d.children ? "#555" : "#999")
          .attr("r", 2.5);
    
      node.append("text")
          .attr("dy", "0.31em")
          .attr("x", d => d.children ? -6 : 6)
          .attr("text-anchor", d => d.children ? "end" : "start")
          .text(d => d.data.name)
        .clone(true).lower()
          .attr("stroke", "white");
      
      return svg.node();
    };
    
    const treePlot = data => {
      const root = hierarchy(data);
      root.dx = 30;
      root.dy = width / (root.height + 1);
      return tree().nodeSize([root.dx, root.dy])(root);
    }

    chart();
  }
});
