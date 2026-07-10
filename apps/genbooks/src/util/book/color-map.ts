type ModuleColorRefItem = {
    id: string;
    color: 4 | 1
}

type ModuleId = ModuleColorRefItem['id']
type Color = ModuleColorRefItem['color']

const ColorMap = new Map<ModuleId, Color>()

export default ColorMap