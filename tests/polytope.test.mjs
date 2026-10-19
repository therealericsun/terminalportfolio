import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePolytope, defaultSeed } from '../public/tesseract/assets/scripts/polytope.js';
import { projectOrientation, rotationPlanes, camera } from '../public/tesseract/assets/scripts/tesseract-math.js';

// Independent Gaussian elimination checks the side of a 4D supporting plane.
function determinant4(rows) {
  const m=rows.map(row=>[...row]);let result=1;
  for(let c=0;c<4;c++){
    let pivot=c;for(let r=c+1;r<4;r++)if(Math.abs(m[r][c])>Math.abs(m[pivot][c]))pivot=r;
    if(Math.abs(m[pivot][c])<1e-12)return 0;
    if(pivot!==c){[m[pivot],m[c]]=[m[c],m[pivot]];result*=-1;}
    result*=m[c][c];
    for(let r=c+1;r<4;r++){const f=m[r][c]/m[c][c];for(let k=c+1;k<4;k++)m[r][k]-=f*m[c][k];}
  }
  return result;
}

test('seeds reproduce geometry and different seeds change its shape',()=>{
  assert.deepEqual(generatePolytope(),generatePolytope(defaultSeed));
  for(const seed of ['1729','42','orbit','🌌'])assert.deepEqual(generatePolytope(seed),generatePolytope(seed));
  assert.notDeepEqual(generatePolytope('42'),generatePolytope('43'));
});

test('generated geometry forms a closed four-dimensional convex polytope',()=>{
  for(let seed=0;seed<64;seed++){
    const {vertices,edges,faces,cells}=generatePolytope(String(seed));
    assert.ok(vertices.length>=12&&vertices.length<=16);
    assert.equal(vertices.length-edges.length+faces.length-cells.length,0,'4D Euler relation');
    assert.equal(faces.length,cells.length*2,'tetrahedral cells share each triangular face twice');
    assert.equal(new Set(edges.map(e=>e.join(','))).size,edges.length);
    assert.equal(new Set(faces.map(f=>f.join(','))).size,faces.length);
    for(const p of vertices){assert.equal(p.length,4);assert.ok(p.every(Number.isFinite));assert.ok(Math.hypot(...p)<=2+1e-10);}
    for(let axis=0;axis<4;axis++)assert.ok(Math.abs(vertices.reduce((sum,p)=>sum+p[axis],0))<1e-10,'centered geometry');
    for(let i=0;i<vertices.length;i++)assert.ok(cells.some(c=>c.includes(i)),'every vertex belongs to the hull');
    for(const face of faces){
      assert.equal(face.length,3);assert.equal(cells.filter(c=>face.every(i=>c.includes(i))).length,2,'closed boundary');
      for(let a=0;a<2;a++)for(let b=a+1;b<3;b++)assert.ok(edges.some(e=>e.includes(face[a])&&e.includes(face[b])));
    }
    for(const cell of cells){
      const base=vertices[cell[0]],rows=cell.slice(1).map(i=>vertices[i].map((v,a)=>v-base[a]));
      const sides=vertices.map(p=>determinant4([...rows,p.map((v,a)=>v-base[a])]));
      assert.ok(!sides.some(v=>v>1e-9)||!sides.some(v=>v< -1e-9),'cell is a supporting 4D facet');
    }
  }
});

test('seeded shapes remain finite and framed at arbitrary angles and perspectives',()=>{
  for(let seed=0;seed<32;seed++){
    const shape=generatePolytope(String(seed));
    for(let turn=0;turn<8;turn++){
      const angles=Object.fromEntries(rotationPlanes.map((p,i)=>[p,(turn+seed)*(i+1)*1.618]));
      for(const distance of [3,5,7])for(const p of projectOrientation(angles,distance,shape.vertices)){
        assert.ok(p.every(Number.isFinite));
        for(const [cols,rows] of [[160,80],[80,100],[160,30]]){
          const [x,y]=camera(p,cols,rows,.5,distance);
          assert.ok(x>0&&x<cols&&y>0&&y<rows,'shape remains within the canvas');
        }
      }
    }
  }
});
