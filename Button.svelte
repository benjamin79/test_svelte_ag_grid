<script>
  import { CustomToolPanel } from './customToolPanel.js'
  console.log(CustomToolPanel)
  var columnDefs = [
    { headerName: 'Athlete', field: 'athlete', width: 150 },
    {
      headerName: 'Age',
      field: 'age',
      width: 90,
      filter: 'agNumberColumnFilter',
    },
    { headerName: 'Country', field: 'country', width: 120 },
    { headerName: 'Year', field: 'year', width: 90 },
    {
      headerName: 'Date',
      field: 'date',
      width: 110,
      filter: 'agDateColumnFilter',
      filterParams: {
        comparator: function(filterLocalDateAtMidnight, cellValue) {
          var dateAsString = cellValue
          var dateParts = dateAsString.split('/')
          var cellDate = new Date(
            Number(dateParts[2]),
            Number(dateParts[1]) - 1,
            Number(dateParts[0]),
          )

          if (filterLocalDateAtMidnight.getTime() == cellDate.getTime()) {
            return 0
          }

          if (cellDate < filterLocalDateAtMidnight) {
            return -1
          }

          if (cellDate > filterLocalDateAtMidnight) {
            return 1
          }
        },
      },
    },
    { headerName: 'Sport', field: 'sport', width: 110 },
    {
      headerName: 'Gold',
      field: 'gold',
      width: 100,
      filter: 'agNumberColumnFilter',
    },
    {
      headerName: 'Silver',
      field: 'silver',
      width: 100,
      filter: 'agNumberColumnFilter',
    },
    {
      headerName: 'Bronze',
      field: 'bronze',
      width: 100,
      filter: 'agNumberColumnFilter',
    },
    {
      headerName: 'Total',
      field: 'total',
      width: 100,
      filter: 'agNumberColumnFilter',
    },
  ]

  var gridOptions = {
    defaultColDef: {
      filter: true,
    },
    columnDefs: columnDefs,
    rowData: null,
    animateRows: true,
    isExternalFilterPresent: isExternalFilterPresent,
    doesExternalFilterPass: doesExternalFilterPass,
    sideBar: {
      toolPanels: [
        {
          id: 'columns',
          labelDefault: 'Columns',
          labelKey: 'columns',
          iconKey: 'columns',
          toolPanel: 'agColumnsToolPanel',
        },
        {
          id: 'customTP',
          labelDefault: 'Custom',
          labelKey: 'customTP',
          iconKey: 'custom-tp',
          toolPanel: CustomToolPanel,
        },
      ],
      defaultToolPanel: 'customTP',
    },
  }

  function onQuickFilterChanged(event) {
    gridOptions.api.setQuickFilter(event.target.value)
  }

  var ageType = 'everyone'

  function isExternalFilterPresent() {
    // if ageType is not everyone, then we are filtering
    return ageType != 'everyone'
  }

  function doesExternalFilterPass(node) {
    switch (ageType) {
      case 'below30':
        return node.data.age < 30
      case 'between30and50':
        return node.data.age >= 30 && node.data.age <= 50
      case 'above50':
        return node.data.age > 50
      case 'dateAfter2008':
        return asDate(node.data.date) > new Date(2008, 1, 1)
      default:
        return true
    }
  }

  function asDate(dateAsString) {
    var splitFields = dateAsString.split('/')
    return new Date(splitFields[2], splitFields[1], splitFields[0])
  }

  function externalFilterChanged(newValue) {
    ageType = newValue
    gridOptions.api.onFilterChanged()
  }

  // setup the grid after the page has finished loading
  document.addEventListener('DOMContentLoaded', function() {
    var gridDiv = document.querySelector('#myGrid')
    new agGrid.Grid(gridDiv, gridOptions)

    gridOptions.api.setRowData([])
  })
</script>

<style>

</style>

<div
  id="myGrid"
  class="ag-theme-balham"
  style="height: 100%;width: 100%; margin-top: 40px;" />
