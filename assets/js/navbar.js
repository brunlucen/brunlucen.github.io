$(function () {
  var header = $('header')

  $(window).scroll(function () {
    var scroll = $(window).scrollTop()
    if (scroll >= 400) {
      header.addClass('scrolled')
    } else {
      header.removeClass('scrolled')
    }
  })
})
